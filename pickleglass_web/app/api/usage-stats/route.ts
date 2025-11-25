import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')

    if (!userId || userId === 'Not loaded' || userId === 'undefined' || userId === 'null') {
      return NextResponse.json({
        userId: userId || 'unknown',
        currentPlan: 'free',
        planName: 'Free',
        used: 0,
        limit: 15,
        remaining: 15,
        isUnlimited: false,
        percentage: 0
      })
    }

    console.log('[Usage Stats API] Attempting to use Electron backend for user:', userId)
    
    // Try to use the Electron backend if available (when running within Electron)
    try {
      // Check if we're running in Electron context by trying to access the backend
      const backendUrl = process.env.ELECTRON_BACKEND_URL || 'http://localhost:50497'
      
      const response = await fetch(`${backendUrl}/api/usage/stats?userId=${encodeURIComponent(userId)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Short timeout since this should be local
        signal: AbortSignal.timeout(2000)
      })

      if (response.ok) {
        const data = await response.json()
        console.log('[Usage Stats API] Successfully got data from Electron backend:', data)
        return NextResponse.json(data)
      }
    } catch (electronError: any) {
      console.log('[Usage Stats API] Electron backend not available:', electronError.message)
    }

    // Fallback: Try to use client-side Firebase (this won't work for server-side but we'll try)
    console.log('[Usage Stats API] Falling back to direct Firestore access')
    
    try {
      // Import Firebase Admin SDK for server-side access
      const admin = require('firebase-admin')
      
      // Initialize Firebase Admin if not already initialized
      if (!admin.apps.length) {
        // This would need proper service account credentials
        throw new Error('Firebase Admin SDK not configured')
      }
      
      const db = admin.firestore()
      const userDoc = await db.collection('users').doc(userId).get()
      
      if (!userDoc.exists) {
        return NextResponse.json({
          userId,
          currentPlan: 'free',
          planName: 'Free',
          used: 0,
          limit: 15,
          remaining: 15,
          isUnlimited: false,
          percentage: 0
        })
      }
      
      const userData = userDoc.data()
      const currentDate = new Date()
      const currentMonth = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1)
      
      let usageData = userData.usageLimit || {
        monthlyRequests: 0,
        lastResetDate: currentDate.toISOString(),
        currentMonth: currentMonth
      }
      
      if (usageData.currentMonth !== currentMonth) {
        usageData = {
          monthlyRequests: 0,
          lastResetDate: currentDate.toISOString(),
          currentMonth: currentMonth
        }
        // Update in Firestore
        await db.collection('users').doc(userId).update({
          usageLimit: usageData,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        })
      }

      const isUnlimited = userData.plan === 'pro'
      const limit = isUnlimited ? null : 15
      const used = usageData.monthlyRequests
      const remaining = isUnlimited ? null : Math.max(0, (limit || 0) - used)
      const percentage = isUnlimited ? 0 : Math.round((used / (limit || 1)) * 100)

      return NextResponse.json({
        userId,
        currentPlan: userData.plan || 'free',
        planName: userData.plan === 'pro' ? 'Pro' : 'Free',
        used,
        limit,
        remaining,
        isUnlimited,
        percentage,
        resetDate: usageData.lastResetDate,
        displayText: isUnlimited ? 'No usage limits' : `${used}/${limit} requests used`
      })
      
    } catch (firestoreError) {
      console.error('[Usage Stats API] Firestore access failed:', firestoreError)
    }

    // Final fallback: return default free plan data
    console.log('[Usage Stats API] All methods failed, returning default data')
    return NextResponse.json({
      userId,
      currentPlan: 'free',
      planName: 'Free',
      used: 0,
      limit: 15,
      remaining: 15,
      isUnlimited: false,
      percentage: 0,
      note: 'Using fallback data - could not access usage tracking service'
    })

  } catch (error: any) {
    console.error('[Usage Stats API] Outer error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}