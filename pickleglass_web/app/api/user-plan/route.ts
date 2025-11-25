import { NextRequest, NextResponse } from 'next/server'
import { FirestoreUserService } from '../../../utils/firestore'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')

    if (!userId || userId === 'Not loaded' || userId === 'undefined' || userId === 'null') {
      return NextResponse.json({
        userId: userId || 'unknown',
        currentPlan: 'free',
        planName: 'Free',
        isUnlimited: false
      })
    }

    let plan: 'free' | 'pro' = 'free'

    try {
      plan = await FirestoreUserService.getUserPlan(userId)
      console.log('[UserPlan API] Retrieved plan from Firestore:', plan)
    } catch (error) {
      console.error('[UserPlan API] Error getting plan from Firestore:', error)
    }

    if (plan === 'free' && process.env.STRIPE_SECRET_KEY) {
      try {
        const Stripe = require('stripe')
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: '2025-07-30.basil',
        });

        const sessions = await stripe.checkout.sessions.list({
          limit: 10,
        })

        const userSession = sessions.data.find((session: any) =>
          session.metadata?.userId === userId &&
          session.payment_status === 'paid' &&
          session.metadata?.planId === 'pro'
        )

        if (userSession) {
          plan = 'pro'
          
          try {
            await FirestoreUserService.updateUserPlan(userId, 'pro')
            console.log('[UserPlan API] Updated user plan to pro in Firestore')
          } catch (error) {
            console.error('[UserPlan API] Error updating plan in Firestore:', error)
          }
        }
      } catch (error) {
        console.error('Error checking Stripe sessions:', error)
      }
    }

    return NextResponse.json({
      userId,
      currentPlan: plan,
      planName: plan === 'pro' ? 'Pro' : 'Free',
      isUnlimited: plan === 'pro'
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}