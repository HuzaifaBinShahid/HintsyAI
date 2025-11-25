import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { userId, subscriptionId } = await request.json()
    
    console.log('[Cancel Subscription] Request:', { userId, subscriptionId })
    
    if (!userId || !subscriptionId) {
      console.log('[Cancel Subscription] Missing required fields')
      return NextResponse.json({ error: 'User ID and Subscription ID required' }, { status: 400 })
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
    
    try {
      // Cancel the subscription at the end of the current period
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      })
      
      console.log(`[Cancel Subscription] Successfully cancelled subscription ${subscriptionId} for user ${userId}`)
      
      return NextResponse.json({
        success: true,
        subscriptionId: subscription.id,
        status: subscription.status,
        cancelAt: subscription.cancel_at,
        message: 'Subscription will be cancelled at the end of the current billing period'
      })
      
    } catch (stripeError: any) {
      console.error('Stripe API error:', stripeError.message)
      
      // If this is a mock subscription (for development), simulate cancellation
      if (subscriptionId.startsWith('sub_mock_')) {
        console.log(`[Cancel Subscription] Mock cancellation for ${subscriptionId}`)
        
        const cancelAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days from now
        
        // Save cancelled subscription to file for persistence
        const fs = require('fs')
        const path = require('path')
        const cancelledFile = path.join(process.cwd(), 'cancelled-subscriptions.json')
        
        let cancelledSubscriptions = {}
        if (fs.existsSync(cancelledFile)) {
          const data = fs.readFileSync(cancelledFile, 'utf8')
          cancelledSubscriptions = JSON.parse(data)
        }
        
        (cancelledSubscriptions as any)[subscriptionId] = {
          userId: userId,
          cancelledAt: Math.floor(Date.now() / 1000),
          cancelAt: cancelAt,
          status: 'cancelled'
        }
        
        fs.writeFileSync(cancelledFile, JSON.stringify(cancelledSubscriptions, null, 2))
        console.log(`[Cancel Subscription] Saved cancelled subscription ${subscriptionId} to file`)
        
        return NextResponse.json({
          success: true,
          subscriptionId: subscriptionId,
          status: 'cancelled',
          cancelAt: cancelAt,
          message: 'Mock subscription cancelled successfully'
        })
      }
      
      // Handle specific Stripe errors
      if (stripeError.type === 'StripeInvalidRequestError') {
        return NextResponse.json({ 
          error: 'Invalid subscription ID or subscription not found' 
        }, { status: 404 })
      }
      
      return NextResponse.json({ 
        error: 'Failed to cancel subscription with Stripe' 
      }, { status: 500 })
    }
    
  } catch (error) {
    console.error('Error cancelling subscription:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
