import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { FirestoreUserService } from '@/utils/firestore'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
})

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature') as string

  let event: Stripe.Event

  try {
    event = JSON.parse(body)
  } catch (err) {
    console.error('Webhook signature verification failed.', err)
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session
      console.log('💰 Payment successful!', {
        sessionId: session.id,
        customerEmail: session.customer_email,
        userId: session.metadata?.userId,
        planId: session.metadata?.planId,
        amount: session.amount_total,
      })
      
      if (session.metadata?.userId && session.metadata?.planId === 'pro') {
        try {
          await FirestoreUserService.updateUserPlan(session.metadata.userId, 'pro')
          console.log('✅ Updated user plan to Pro in Firestore:', session.metadata.userId)
        } catch (error) {
          console.error('❌ Error updating user plan in Firestore:', error)
        }
      }
      break
      
    case 'invoice.payment_succeeded':
      const invoice = event.data.object as Stripe.Invoice
      console.log('📋 Invoice payment succeeded:', {
        invoiceId: invoice.id,
        customerEmail: invoice.customer_email,
        amount: invoice.amount_paid,
      })
      break
      
    case 'invoice.payment_failed':
      const failedInvoice = event.data.object as Stripe.Invoice
      console.log('❌ Invoice payment failed:', {
        invoiceId: failedInvoice.id,
        customerEmail: failedInvoice.customer_email,
        amount: failedInvoice.amount_due,
      })
      break
      
    case 'customer.subscription.updated':
      const subscription = event.data.object as Stripe.Subscription
      console.log('🔄 Subscription updated:', {
        subscriptionId: subscription.id,
        status: subscription.status,
        customerId: subscription.customer,
      })
      break
      
    case 'customer.subscription.deleted':
      const deletedSubscription = event.data.object as Stripe.Subscription
      console.log('🗑️ Subscription cancelled:', {
        subscriptionId: deletedSubscription.id,
        customerId: deletedSubscription.customer,
      })
      break
      
    default:
      console.log(`Unhandled event type ${event.type}`)
  }

  return NextResponse.json({ received: true })
}