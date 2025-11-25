const Store = require('electron-store');
const { SUBSCRIPTION_PLANS } = require('../config/centralizedKeys.js');

class UsageTrackingService {
    constructor() {
        this.store = new Store({ name: 'usage-tracking' });
        this.currentUserId = 'default_user';
        this.currentPlan = 'free';
        this.usageData = {
            monthlyRequests: 0,
            lastResetDate: null,
            currentMonth: null
        };
        this.loadUsageData();
    }
    
    setCurrentUser(userId) {
        console.log('[UsageTrackingService] Setting current user:', userId);
        const previousUserId = this.currentUserId;
        this.currentUserId = userId || 'default_user';
        
        // Only load data if we're switching to a different user
        if (previousUserId !== this.currentUserId) {
            console.log(`[UsageTrackingService] Switching from user ${previousUserId} to ${this.currentUserId}`);
            this.loadUsageData();
        } else {
            console.log(`[UsageTrackingService] Same user ${this.currentUserId}, skipping data reload`);
        }
    }

    loadUsageData() {
        try {
            const userKey = `usageTracking.${this.currentUserId}`;
            const stored = this.store.get(userKey);
            if (stored) {
                this.usageData = stored;
                console.log(`[UsageTrackingService] Loaded existing usage data for user ${this.currentUserId}:`, this.usageData);
            } else {
                const currentDate = new Date();
                const currentMonth = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1);
                this.usageData = {
                    monthlyRequests: 0,
                    lastResetDate: currentDate.toISOString(),
                    currentMonth: currentMonth
                };
                console.log(`[UsageTrackingService] Initialized new usage data for user ${this.currentUserId}:`, this.usageData);
                // Save the initial data immediately
                this.saveUsageData();
            }
            
            this.loadCurrentPlan();
            // Only check for monthly reset, don't force reset
            this.checkAndResetMonthlyCount();
        } catch (error) {
            console.error('Error loading usage data:', error);
        }
    }

    saveUsageData() {
        try {
            const userKey = `usageTracking.${this.currentUserId}`;
            this.store.set(userKey, this.usageData);
            console.log(`[UsageTrackingService] Saved usage data for user ${this.currentUserId}:`, this.usageData);
        } catch (error) {
            console.error('Error saving usage data:', error);
        }
    }

    checkAndResetMonthlyCount() {
        const currentDate = new Date();
        const currentMonth = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1);
        
        if (this.usageData.currentMonth !== currentMonth) {
            console.log(`[UsageTrackingService] Month changed from ${this.usageData.currentMonth} to ${currentMonth}, resetting usage`);
            this.usageData.monthlyRequests = 0;
            this.usageData.currentMonth = currentMonth;
            this.usageData.lastResetDate = currentDate.toISOString();
            this.saveUsageData();
        } else {
            console.log(`[UsageTrackingService] Same month (${currentMonth}), keeping usage at ${this.usageData.monthlyRequests}`);
        }
    }

    setCurrentPlan(planName) {
        this.currentPlan = planName;
        const userKey = `currentPlan.${this.currentUserId}`;
        this.store.set(userKey, planName);
    }

    loadCurrentPlan() {
        const userKey = `currentPlan.${this.currentUserId}`;
        const storedPlan = this.store.get(userKey);
        if (storedPlan) {
            this.currentPlan = storedPlan;
            console.log(`[UsageTrackingService] Loaded stored plan for user ${this.currentUserId}: ${storedPlan}`);
        } else {
            this.currentPlan = 'free';
            console.log(`[UsageTrackingService] No stored plan found for user ${this.currentUserId}, setting to default: free`);
        }
    }

    getCurrentPlan() {
        return this.currentPlan;
    }

    getPlanDetails(planName = null) {
        const plan = planName || this.currentPlan;
        return SUBSCRIPTION_PLANS[plan] || SUBSCRIPTION_PLANS.free;
    }

    canMakeRequest() {
        this.checkAndResetMonthlyCount();
        
        const planDetails = this.getPlanDetails();
        const limit = planDetails.monthlyRequests;
        
        if (this.currentPlan === 'pro') {
            return true;
        }
        
        if (this.currentPlan === 'free') {
            return this.usageData.monthlyRequests < 15;
        }
        
        return this.usageData.monthlyRequests < limit;
    }

    recordRequest() {
        this.checkAndResetMonthlyCount();
        this.usageData.monthlyRequests++;
        this.saveUsageData();
        
        console.log(`[UsageTrackingService] Request recorded for user ${this.currentUserId}. Monthly count: ${this.usageData.monthlyRequests}`);
    }

    getUsageStats() {
        this.checkAndResetMonthlyCount();
        
        const planDetails = this.getPlanDetails();
        const used = this.usageData.monthlyRequests;
        const isUnlimited = this.currentPlan === 'pro' || planDetails.monthlyRequests === -1;
        
        const limit = isUnlimited ? null : (this.currentPlan === 'free' ? 15 : planDetails.monthlyRequests);
        const remaining = isUnlimited ? null : Math.max(0, limit - used);
        const percentage = isUnlimited ? 0 : (limit > 0 ? Math.round((used / limit) * 100) : 0);
        
        return {
            currentPlan: this.currentPlan,
            planName: planDetails.name,
            used: used,
            limit: limit,
            remaining: remaining,
            isUnlimited: isUnlimited,
            percentage: percentage
        };
    }

    isFreePlanLimitReached() {
        return this.currentPlan === 'free' && this.usageData.monthlyRequests >= 15;
    }

    getUpgradeMessage() {
        const stats = this.getUsageStats();
        
        if (this.currentPlan === 'free' && stats.used >= 15) {
            return {
                show: true,
                message: `You've used ${stats.used}/15 free requests this month.`,
                action: 'Upgrade to Pro',
                actionUrl: `${process.env.Hintsy_AI_URL || 'http://localhost:3000'}/settings/billing`
            };
        }
        
        if (this.currentPlan === 'free' && stats.used >= 10) {
            return {
                show: true,
                message: `You've used ${stats.used}/15 free requests this month.`,
                action: 'Upgrade to Pro',
                actionUrl: `${process.env.Hintsy_AI_URL || 'http://localhost:3000'}/settings/billing`
            };
        }
        
        return {
            show: false,
            message: '',
            action: '',
            actionUrl: ''
        };
    }

    resetUsage() {
        console.log(`[UsageTrackingService] 🚨 RESETTING USAGE for user ${this.currentUserId}`);
        this.usageData.monthlyRequests = 0;
        this.usageData.currentMonth = new Date().getFullYear() + '-' + (new Date().getMonth() + 1);
        this.usageData.lastResetDate = new Date().toISOString();
        this.saveUsageData();
    }
}

const usageTrackingService = new UsageTrackingService();

module.exports = { usageTrackingService }; 