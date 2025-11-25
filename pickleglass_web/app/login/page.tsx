'use client'

import { useRouter } from 'next/navigation'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '@/utils/firebase'
import { Chrome } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isElectronMode, setIsElectronMode] = useState(false)
  const [returnUrl, setReturnUrl] = useState('')
  const [authStatus, setAuthStatus] = useState('')

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const mode = urlParams.get('mode')
    const returnTo = urlParams.get('returnUrl')
    setIsElectronMode(mode === 'electron')
    setReturnUrl(returnTo || '')
  }, [])

  const attemptDeepLink = async (user: any) => {
    try {
      const idToken = await user.getIdToken()
      const params = new URLSearchParams({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        token: idToken
      })

      if (returnUrl) {
        params.append('returnUrl', returnUrl)
      }

      const deepLinkUrl = `pickleglass://auth-success?${params.toString()}`
      
      setAuthStatus('Redirecting to app...')
      console.log('[Login] Attempting deep link:', deepLinkUrl)
      console.log('[Login] User Agent:', navigator.userAgent)
      console.log('[Login] Is Electron context:', typeof window !== 'undefined' && window.require)
      
      // Production-optimized approach for protocol handling
      console.log('[Login] Is production:', process.env.NODE_ENV === 'production')
      console.log('[Login] Current origin:', window.location.origin)
      
      let redirectSuccess = false
      
      // Method 1: Try iframe approach first (works better with COOP policies)
      try {
        const iframe = document.createElement('iframe')
        iframe.style.display = 'none'
        iframe.src = deepLinkUrl
        document.body.appendChild(iframe)
        
        setTimeout(() => {
          document.body.removeChild(iframe)
        }, 1000)
        
        console.log('[Login] Method 1 (iframe) attempted')
        redirectSuccess = true
      } catch (e) {
        console.log('[Login] Method 1 (iframe) failed:', e)
      }
      
      // Method 2: Direct window.location (backup)
      setTimeout(() => {
        if (!redirectSuccess) {
          try {
            window.location.assign(deepLinkUrl)
            console.log('[Login] Method 2 (window.location.assign) attempted')
            redirectSuccess = true
          } catch (e) {
            console.log('[Login] Method 2 failed:', e)
          }
        }
      }, 500)
      
      // Method 3: Create and click a link with proper attributes
      setTimeout(() => {
        if (!redirectSuccess) {
          try {
            const link = document.createElement('a')
            link.href = deepLinkUrl
            link.style.display = 'none'
            // Don't use target="_blank" to avoid COOP issues
            link.rel = 'noopener'
            document.body.appendChild(link)
            
            // Simulate user click to avoid popup blockers
            const clickEvent = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true
            })
            link.dispatchEvent(clickEvent)
            
            setTimeout(() => {
              document.body.removeChild(link)
            }, 100)
            
            console.log('[Login] Method 3 (enhanced link click) attempted')
            redirectSuccess = true
          } catch (e) {
            console.log('[Login] Method 3 failed:', e)
          }
        }
      }, 1000)

      // Method 4: Fallback with window.open and immediate close
      setTimeout(() => {
        if (!redirectSuccess) {
          try {
            const popup = window.open(deepLinkUrl, '_blank', 'width=1,height=1')
            if (popup) {
              setTimeout(() => popup.close(), 100)
            }
            console.log('[Login] Method 4 (popup fallback) attempted')
          } catch (e) {
            console.log('[Login] Method 4 failed:', e)
          }
        }
      }, 1500)

      // Provide user feedback with better messaging
      setTimeout(() => {
        setAuthStatus('✅ Authentication successful! Opening HintsyAI app...')
      }, 2000)
      
      setTimeout(() => {
        setAuthStatus('✅ Login completed! If the app didn\'t open automatically, please return to HintsyAI.')
        setIsLoading(false)
      }, 5000)

    } catch (error) {
      console.error('[Login] Deep link failed:', error)
      setAuthStatus('✅ Login successful! Please return to the Hintsy AI app.')
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider()
    setIsLoading(true)
    setAuthStatus('Signing in with Google...')

    try {
      const currentUser = auth.currentUser
      let result
      
      // For development: if no current user but we're testing account linking, create anonymous user first
      if (!currentUser && process.env.NODE_ENV === 'development') {
        console.log('[Login] No current user in dev mode, creating anonymous user for testing...')
        setAuthStatus('Creating test anonymous user...')
        
        try {
          const { signInAnonymously } = await import('firebase/auth')
          const anonResult = await signInAnonymously(auth)
          console.log('[Login] Created anonymous user for testing:', anonResult.user.uid)
          
          // Now link this anonymous user
          setAuthStatus('Linking anonymous user to Google account...')
          const { linkWithPopup } = await import('firebase/auth')
          result = await linkWithPopup(anonResult.user, provider)
          
          console.log('[Login] Account linking successful:', result.user.uid)
          setAuthStatus('Account linked successfully!')
        } catch (anonError) {
          console.log('[Login] Anonymous auth failed, falling back to regular sign-in')
          result = await signInWithPopup(auth, provider)
          setAuthStatus('Google sign-in successful!')
        }
      } else if (currentUser && currentUser.isAnonymous) {
        console.log('[Login] Linking existing anonymous user to Google account')
        setAuthStatus('Linking your account...')
        
        const { linkWithPopup } = await import('firebase/auth')
        result = await linkWithPopup(currentUser, provider)
        
        console.log('[Login] Account linking successful:', result.user.uid)
        setAuthStatus('Account linked successfully!')
      } else {
        result = await signInWithPopup(auth, provider)
        console.log('[Login] Google sign-in successful:', result.user.uid)
        setAuthStatus('Google sign-in successful!')
      }
      
      const user = result.user

      if (user) {
        console.log('[Login] Authentication successful for user:', user.uid)
        setAuthStatus('Login successful!')

        if (isElectronMode) {
          await attemptDeepLink(user)
        }
        else if (typeof window !== 'undefined' && window.require) {
          try {
            const { ipcRenderer } = window.require('electron')
            const idToken = await user.getIdToken()

            ipcRenderer.send('firebase-auth-success', {
              uid: user.uid,
              displayName: user.displayName,
              email: user.email,
              idToken
            })
            setAuthStatus('✅ Authentication sent to app!')
          } catch (error) {
            console.error('❌ Electron communication failed:', error)
            setAuthStatus('✅ Login successful! Please return to the app.')
          } finally {
            setIsLoading(false)
          }
        }
        else {
          setAuthStatus('Redirecting...')
          router.push(returnUrl ? decodeURIComponent(returnUrl) : '/settings')
        }
      }
    } catch (error: any) {
      console.error('❌ Google login failed:', error)
      setIsLoading(false)
      setAuthStatus('')

      if (error.code === 'auth/popup-closed-by-user') {
        setAuthStatus('Login cancelled.')
      } else if (error.code === 'auth/credential-already-in-use') {
        setAuthStatus('This Google account is already linked to another user.')
      } else {
        setAuthStatus('❌ Login failed. Please try again.')
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome to Hintsy AI</h1>
        <p className="text-gray-600 mt-2">Sign in with your Google account to sync your data across all devices.</p>
        {isElectronMode && (
          <p className="text-sm text-blue-600 mt-1 font-medium">🔗 Login requested from Electron app</p>
        )}
        {authStatus && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">{authStatus}</p>
          </div>
        )}
      </div>

      <div className="w-full max-w-sm">
        <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200">
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Chrome className="h-5 w-5" />
            <span>{isLoading ? 'Signing in...' : 'Sign in with Google'}</span>
          </button>
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
} 