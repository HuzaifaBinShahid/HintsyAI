import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  try {
    const { planId, userId, userEmail } = await request.json()
    
    // Validate required user data
    if (!userId || !userEmail) {
      return NextResponse.json(
        { error: 'User authentication required. Please log in first.' },
        { status: 401 }
      )
    }
    
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY
    
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY not found in environment variables')
      return NextResponse.json({ 
        error: 'Payment system not configured. Please contact support.'
      }, { status: 500 })
    }

    console.log('Setting up Stripe with key ending in:', stripeSecretKey.slice(-10))
    
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-07-30.basil',
    })

    // Define pricing for plans
    const pricing = {
      pro: {
        amount: 1000, // $10.00 in cents
        currency: 'usd',
        interval: 'month'
      }
    }

    const plan = pricing[planId as keyof typeof pricing]
    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400 }
      )
    }

    // Create or get existing product and price
    let priceId: string
    try {
      // Check if we have an existing product for Pickle Glass
      const products = await stripe.products.list({
        limit: 100,
      })
      
      let product = products.data.find(p => p.name === 'Hintsy AI Pro')
      
      if (!product) {
        // Create a new product if it doesn't exist
        product = await stripe.products.create({
          name: 'Hintsy AI Pro',
          description: 'Unlimited AI requests, premium models, and advanced features',
        })
      }

      // Check if we have an existing price for this product
      const prices = await stripe.prices.list({
        product: product.id,
        limit: 100,
      })
      
      let price = prices.data.find(p => 
        p.unit_amount === plan.amount && 
        p.currency === plan.currency &&
        p.recurring?.interval === plan.interval
      )
      
      if (!price) {
        // Create a new price if it doesn't exist
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: plan.amount,
          currency: plan.currency,
                  recurring: {
          interval: plan.interval as 'month',
        },
        })
      }

      priceId = price.id
    } catch (error) {
      console.error('Error setting up Stripe product/price:', error)
      return NextResponse.json(
        { error: 'Failed to set up pricing. Please try again.' },
        { status: 500 }
      )
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.Hintsy_AI_URL || "http://localhost:3000"}/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.Hintsy_AI_URL || "http://localhost:3000"}/settings/billing?canceled=true`,
      customer_email: userEmail,
      metadata: {
        planId,
        userId,
        userEmail,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    
    if (error instanceof Error) {
      if (error.message.includes('No such price')) {
        return NextResponse.json(
          { error: 'Invalid pricing configuration. Please contact support.' },
          { status: 500 }
        )
      }
      if (error.message.includes('Invalid API Key')) {
        console.error('Invalid Stripe API key detected')
        return NextResponse.json(
          { 
            error: 'Demo mode: Stripe not properly configured',
            demo: true,
            message: 'This is a demonstration. To enable real payments, configure valid Stripe API keys.'
          },
          { status: 200 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to process subscription. Please try again.' },
      { status: 500 }
    )
  }
} 