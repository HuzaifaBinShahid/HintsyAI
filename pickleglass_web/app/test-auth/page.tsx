'use client'

import { useAuth } from '@/utils/auth'

export default function TestAuthPage() {
  const { user, isLoading, mode } = useAuth()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Firebase Auth Test</h1>
      
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Authentication Status</h2>
        
        <div className="space-y-2">
          <p><strong>Loading:</strong> {isLoading ? 'Yes' : 'No'}</p>
          <p><strong>Mode:</strong> {mode || 'Not set'}</p>
          <p><strong>User:</strong> {user ? 'Authenticated' : 'Not authenticated'}</p>
          
          {user && (
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <h3 className="font-semibold mb-2">User Details:</h3>
              <p><strong>UID:</strong> {user.uid}</p>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Display Name:</strong> {user.display_name}</p>
            </div>
          )}
        </div>
        
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Test API Calls:</h3>
          <button 
            onClick={async () => {
              if (user?.uid) {
                const response = await fetch(`/api/user-plan?userId=${user.uid}`)
                const data = await response.json()
                console.log('User Plan API Response:', data)
                alert(`Plan: ${data.currentPlan}`)
              } else {
                alert('No user UID available')
              }
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Test User Plan API
          </button>
        </div>
      </div>
    </div>
  )
} 