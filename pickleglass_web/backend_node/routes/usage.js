const express = require('express');
const router = express.Router();

// Get real usage stats from Electron app
router.get('/stats', async (req, res) => {
  try {
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Use global services to get stats from main process
    console.log('[Usage API] Using global services to get usage stats for user:', userId);
    console.log('[Usage API] Global services available:', !!global.pickleglassServices);
    console.log('[Usage API] Available service keys:', global.pickleglassServices ? Object.keys(global.pickleglassServices) : 'none');
    
    if (!global.pickleglassServices || !global.pickleglassServices.firestoreUsageService) {
      console.log('[Usage API] Services not available, trying direct require...');
      // Fallback: try to require services directly
      try {
        const path = require('path');
        const servicePath = path.resolve(__dirname, '../../src/features/common/services/firestoreUsageService.js');
        console.log('[Usage API] Trying to load from:', servicePath);
        const directService = require(servicePath);
        if (!directService) {
          throw new Error('Direct service require failed');
        }
        console.log('[Usage API] Successfully loaded service directly');
        global.pickleglassServices = global.pickleglassServices || {};
        global.pickleglassServices.firestoreUsageService = directService;
      } catch (e) {
        console.error('[Usage API] Direct require failed:', e.message);
        throw new Error('Usage tracking service not available');
      }
    }
    
    const firestoreUsageService = global.pickleglassServices.firestoreUsageService;
    
    // Set the current user if provided
    if (userId) {
      firestoreUsageService.setCurrentUser(userId);
    }
    
    // Get usage stats directly from service
    const stats = await firestoreUsageService.getUsageStats();
    const currentPlan = firestoreUsageService.getCurrentPlan();
    const planDetails = firestoreUsageService.getPlanDetails();
    const usageData = firestoreUsageService.usageData;
    
    const usageStats = {
      ...stats,
      currentPlan: currentPlan,
      planName: planDetails.name,
      currentMonth: usageData.currentMonth,
      lastResetDate: usageData.lastResetDate
    };
    
    if (!usageStats) {
      return res.status(404).json({ error: 'Usage stats not found for user' });
    }

    const response = {
      currentPlan: usageStats.currentPlan,
      planName: usageStats.planName,
      used: usageStats.used,
      limit: usageStats.limit,
      remaining: usageStats.remaining,
      isUnlimited: usageStats.isUnlimited,
      percentage: usageStats.percentage,
      currentMonth: usageStats.currentMonth,
      lastResetDate: usageStats.lastResetDate,
      isRealData: true, // This is real data from Electron app
      lastUpdated: new Date().toISOString(),
      
      // Additional metadata
      features: usageStats.currentPlan === 'pro' ? [
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
    };

    console.log(`[Usage API] Returning real usage stats for user ${userId}:`, response);
    res.json(response);
    
  } catch (error) {
    console.error('[Usage API] Error getting usage stats:', error);
    console.error('[Usage API] Error stack:', error.stack);
    console.error('[Usage API] Error message:', error.message);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      stack: error.stack
    });
  }
});

module.exports = router; 