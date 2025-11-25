import { FirestoreUserService } from './firestore'
import { auth as firebaseAuth } from './firebase'

export class UsageService {
  static async getUserUsageStats(userId?: string) {
    try {
      const uid = userId || firebaseAuth.currentUser?.uid
      
      if (!uid) {
        return {
          userId: 'unknown',
          currentPlan: 'free',
          planName: 'Free',
          used: 0,
          limit: 15,
          remaining: 15,
          isUnlimited: false,
          percentage: 0
        }
      }

      const user = await FirestoreUserService.getUser(uid)
      
      if (!user) {
        return {
          userId: uid,
          currentPlan: 'free',
          planName: 'Free',
          used: 0,
          limit: 15,
          remaining: 15,
          isUnlimited: false,
          percentage: 0
        }
      }

      const currentDate = new Date()
      const currentMonth = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1)
      
      let usageData = user.usageLimit
      
      // Check if we need to reset for new month
      if (usageData.currentMonth !== currentMonth) {
        usageData = {
          monthlyRequests: 0,
          lastResetDate: currentDate.toISOString(),
          currentMonth: currentMonth
        }
        // Update the user data
        await FirestoreUserService.updateUserUsage(uid, usageData)
      }

      const isUnlimited = user.plan === 'pro'
      const limit = isUnlimited ? null : 15
      const used = usageData.monthlyRequests
      const remaining = isUnlimited ? null : Math.max(0, (limit || 0) - used)
      const percentage = isUnlimited ? 0 : Math.round((used / (limit || 1)) * 100)

      return {
        userId: uid,
        currentPlan: user.plan,
        planName: user.plan === 'pro' ? 'Pro' : 'Free',
        used,
        limit,
        remaining,
        isUnlimited,
        percentage,
        resetDate: usageData.lastResetDate,
        displayText: isUnlimited ? 'No usage limits' : `${used}/${limit} requests used`
      }

    } catch (error) {
      console.error('[UsageService] Error getting usage stats:', error)
      return {
        userId: userId || 'unknown',
        currentPlan: 'free',
        planName: 'Free',
        used: 0,
        limit: 15,
        remaining: 15,
        isUnlimited: false,
        percentage: 0,
        error: 'Failed to load usage data'
      }
    }
  }
}