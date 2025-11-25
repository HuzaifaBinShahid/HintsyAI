'use client'

import Link from 'next/link'
import { useAuth } from '@/utils/auth'
import { useRouter } from 'next/navigation'
import { UsageService } from '@/utils/usageService'
import { useState, useEffect, useCallback } from 'react'

interface UsageStats {
  currentPlan: string
  planName: string
  used: number
  limit: number | null
  remaining: number | null
  isUnlimited: boolean
  percentage: number
  lastResetDate?: string
  currentMonth?: string
  isRealData?: boolean
  features?: string[]
}

export default function DashboardPage() {
  const { user, isLoading, mode } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authCheckComplete, setAuthCheckComplete] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  


  useEffect(() => {
    if (!isLoading) {
      if (!user || (user.uid === 'default_user' && user.email !== 'anonymous@hintsy.ai')) {
        const returnUrl = encodeURIComponent('/dashboard')
        const isElectronMode = window.location.search.includes('mode=electron') || window.location.href.includes('localhost:50496')
        router.push(`/login?returnUrl=${returnUrl}${isElectronMode ? '&mode=electron' : ''}`)
        return
      }
      setAuthCheckComplete(true)
    }
  }, [user, isLoading, router])

  const refreshData = async () => {
    setRefreshing(true)
    setDataLoading(true)
    setError('')
    
    try {
      const userId = user?.uid && user.uid !== 'Not loaded' ? user.uid : user?.email

      let response, data;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          attempts++;
          
          const planResponse = await fetch(`/api/user-plan?userId=${encodeURIComponent(userId || '')}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
          })
          const planData = await planResponse.json()
          
          const usageData = await UsageService.getUserUsageStats(userId)
          
          data = {
            ...usageData,
            currentPlan: planData.currentPlan,
            planName: planData.planName,
            isUnlimited: planData.isUnlimited,
            features: planData.currentPlan === 'pro' ? [
              'Unlimited AI requests',
              'Priority support',
              'Advanced features',
              'No usage limits'
            ] : [
              '15 requests per month',
              'Basic AI features',
              'Standard support',
              'Usage restrictions'
            ]
          }
          
          if (planData.currentPlan === 'pro') {
            data.limit = null
            data.remaining = null
            data.percentage = 0
          }
          
          break;
          
        } catch (fetchError) {
          if (fetchError instanceof TypeError && (fetchError.message.includes('redirect') || fetchError.message.includes('Failed to fetch'))) {
            if (attempts >= maxAttempts) {
              const fallbackUsed = 5
              data = {
                currentPlan: 'free',
                planName: 'Free',
                used: fallbackUsed,
                limit: 15,
                remaining: Math.max(0, 15 - fallbackUsed),
                isUnlimited: false,
                percentage: Math.round((fallbackUsed / 15) * 100),
                lastResetDate: new Date().toISOString(),
                currentMonth: new Date().toISOString().slice(0, 7),
                isRealData: false,
                features: [
                  '15 requests per month',
                  'Basic AI features',
                  'Standard support',
                  'Usage restrictions'
                ]
              }
              response = { ok: true }
              console.log('[DashboardPage] Refresh fallback: Created usage data for Free user with fixed usage:', fallbackUsed)
              break;
            }
            continue;
          } else {
            throw fetchError;
          }
        }
      }

      if (data) {
        if (!data.currentPlan) {
          data.currentPlan = 'free'
          data.planName = 'Free'
        }
        

        
        setStats(data)
        setLastRefreshed(new Date())
        console.log('[DashboardPage] Successfully refreshed usage stats:', data)
        console.log('[DashboardPage] Current plan from data:', data.currentPlan)
        console.log('[DashboardPage] Plan name from data:', data.planName)
      } else {
        throw new Error('No data received from usage service')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh usage data')
    } finally {
      setRefreshing(false)
      setDataLoading(false)
    }
  }

  const removedFetchUsageStats = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      
      const userId = user?.uid && user.uid !== 'Not loaded' ? user.uid : user?.email
      
      let response, data;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          attempts++;
          
          data = await UsageService.getUserUsageStats(userId)
          break;
          
        } catch (fetchError) {
          if (fetchError instanceof TypeError && (fetchError.message.includes('redirect') || fetchError.message.includes('Failed to fetch'))) {
            if (attempts >= maxAttempts) {
              const fallbackUsed = Math.floor(Math.random() * 12) + 3
              data = {
                currentPlan: 'free',
                planName: 'Free',
                used: fallbackUsed,
                limit: 15,
                remaining: Math.max(0, 15 - fallbackUsed),
                isUnlimited: false,
                percentage: Math.round((fallbackUsed / 15) * 100),
                lastResetDate: new Date().toISOString(),
                currentMonth: new Date().toISOString().slice(0, 7),
                isRealData: false,
                features: [
                  '15 requests per month',
                  'Basic AI features',
                  'Standard support',
                  'Usage restrictions'
                ]
              }
              response = { ok: true }
              break;
            }
            continue;
          } else {
            throw fetchError;
          }
        }
      }

      if (response && response.ok && data) {
        setStats(data)
        setLastRefreshed(new Date())
      } else {
        throw new Error(data?.error || 'Failed to fetch usage data')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authCheckComplete && user && user.uid !== 'default_user' && !stats) {
      const userId = user?.uid && user.uid !== 'Not loaded' ? user.uid : user?.email
      
      const initializeData = async () => {
      setDataLoading(true)
      const fallbackUsed = 5
      const immediateData = {
        currentPlan: 'free',
        planName: 'Free',
        used: fallbackUsed,
        limit: 15,
        remaining: Math.max(0, 15 - fallbackUsed),
        isUnlimited: false,
        percentage: Math.round((fallbackUsed / 15) * 100),
        lastResetDate: new Date().toISOString(),
        currentMonth: new Date().toISOString().slice(0, 7),
        isRealData: false,
        features: [
          '15 requests per month',
          'Basic AI features',
          'Standard support',
          'Usage restrictions'
        ]
      }
      
      setStats(immediateData)
      setLastRefreshed(new Date())
      setLoading(false)
      try {
        const planResponse = await fetch(`/api/user-plan?userId=${encodeURIComponent(userId || '')}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store'
        })
        const planData = await planResponse.json()
        
        const usageData = await UsageService.getUserUsageStats(userId)
        
        let realData = {
          ...usageData,
          currentPlan: planData.currentPlan,
          planName: planData.planName,
          isUnlimited: planData.isUnlimited,
          features: planData.currentPlan === 'pro' ? [
            'Unlimited AI requests',
            'Priority support',
            'Advanced features',
            'No usage limits'
          ] : [
            '15 requests per month',
            'Basic AI features',
            'Standard support',
            'Usage restrictions'
          ]
        }
        
        if (planData.currentPlan === 'pro') {
          realData.limit = null
          realData.remaining = null
          realData.percentage = 0
        }
        
        setStats(realData)
        setLastRefreshed(new Date())
      } catch (error) {
      } finally {
        setDataLoading(false)
      }
      }
      
      initializeData()
    } else {
    }
  }, [authCheckComplete, user])

  const getUsageColor = (percentage: number) => {
    if (percentage < 50) return 'text-green-400'
    if (percentage < 80) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getProgressColor = (percentage: number) => {
    if (percentage < 50) return 'bg-green-500'
    if (percentage < 80) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  if (isLoading || !authCheckComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="text-gray-600 mt-4 text-center">Checking authentication...</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="text-gray-600 mt-4 text-center">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200 max-w-md">
          <div className="text-red-500 text-center">
            <svg className="mx-auto h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h2 className="text-xl font-semibold mb-2 text-gray-900">Error Loading Dashboard</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={refreshData}
              disabled={refreshing}
              className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {refreshing ? 'Refreshing...' : 'Try Again'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white p-6 mb-8 rounded-lg shadow-md border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Usage Dashboard</h1>
              <p className="text-gray-600">Track your AI request usage and plan details</p>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/settings/billing"
                className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Billing
              </Link>
              <button
                onClick={refreshData}
                disabled={refreshing || dataLoading}
                className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                title="Refresh Data"
              >
                {refreshing || dataLoading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {dataLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
              <p className="text-gray-600 mt-4 text-center">Loading usage data...</p>
            </div>
          </div>
        ) : stats && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Plan Overview */}
            <div className="lg:col-span-2">
              <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-semibold text-gray-900">Current Plan</h2>
                  <div className={`px-4 py-2 rounded-full text-sm font-medium ${
                    stats.currentPlan === 'pro' 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-gray-200 text-gray-700'
                  }`}>
                    {stats.planName}
                  </div>
                </div>

                {/* Usage Progress */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Usage This Month</h3>
                    <span className="text-sm text-gray-500">{stats.currentMonth}</span>
                  </div>
                  
                  {stats.isUnlimited ? (
                    <div className="text-center py-8">
                      <div className="text-4xl font-bold text-indigo-600 mb-2">
                        {stats.used}
                      </div>
                      <div className="text-lg text-gray-600 mb-2">Requests Used</div>
                      <div className="text-sm text-gray-500">✨ Unlimited Plan</div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-2xl font-bold ${getUsageColor(stats.percentage)}`}>
                          {stats.used} / {stats.limit}
                        </span>
                        <span className={`text-sm font-medium ${getUsageColor(stats.percentage)}`}>
                          {stats.percentage}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                        <div
                          className={`h-3 rounded-full transition-all duration-500 ${getProgressColor(stats.percentage)}`}
                          style={{ width: `${Math.min(stats.percentage, 100)}%` }}
                        ></div>
                      </div>
                      <div className="text-sm text-gray-600">
                        {stats.remaining} requests remaining
                      </div>
                    </div>
                  )}
                </div>

                {/* Plan Features */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Plan Features</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stats.currentPlan === 'pro' ? (
                      <>
                        <div className="flex items-center space-x-3">
                          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span className="text-gray-700">Unlimited AI requests</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span className="text-gray-700">Priority support</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span className="text-gray-700">Advanced features</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span className="text-gray-700">No usage limits</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center space-x-3">
                          <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span className="text-gray-700">15 requests per month</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span className="text-gray-700">Basic AI features</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          <span className="text-gray-500">Limited support</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          <span className="text-gray-500">Usage restrictions</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-6">
              {/* Upgrade CTA */}
              {stats.currentPlan === 'free' && (
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Upgrade to Pro</h3>
                    <p className="text-gray-600 text-sm mb-4">Get unlimited requests and advanced features</p>
                    <Link
                      href="/settings/billing"
                      className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-all duration-200"
                    >
                      Upgrade Now
                      <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </Link>
                  </div>
                </div>
              )}

              {/* Usage Warning */}
              {!stats.isUnlimited && stats.percentage >= 80 && (
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 border-l-4 border-red-500">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-red-500 mt-1 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h3 className="text-sm font-medium text-red-600">Usage Warning</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        You've used {stats.percentage}% of your monthly limit. Consider upgrading to avoid interruptions.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Account Info */}
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Email</span>
                    <span className="text-gray-900 text-sm">{user?.email}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Plan</span>
                    <span className="text-gray-900 text-sm">{stats.planName}</span>
                  </div>
                </div>
              </div>
              

              {/* Quick Links */}
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h3>
                <div className="space-y-2">
                  <Link
                    href="/settings/billing"
                    className="block w-full text-left px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all duration-200"
                  >
                    <svg className="w-4 h-4 inline mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    Billing & Plans
                  </Link>
                  <button
                    onClick={() => window.location.href = 'mailto:support@pickle.com'}
                    className="block w-full text-left px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all duration-200"
                  >
                    <svg className="w-4 h-4 inline mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Contact Support
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* No custom styles needed - using Tailwind classes */}
    </div>
  )
}
