const { doc, getDoc, setDoc, updateDoc, serverTimestamp } = require('firebase/firestore');
const { getFirestoreInstance } = require('./firebaseClient');

class FirestoreUsageService {
    constructor() {
        this.currentUserId = 'default_user';
        this.currentPlan = 'free';
        this.usageData = {
            monthlyRequests: 0,
            lastResetDate: null,
            currentMonth: null
        };
    }
    
    setCurrentUser(userId) {
        console.log('[FirestoreUsageService] Setting current user:', userId);
        const isAnonymous = this.isCurrentUserAnonymous();
        if (userId !== 'default_user' && userId.length > 20) {
            console.log('[FirestoreUsageService] User appears to be anonymous, will track in Firestore');
        }
        this.currentUserId = userId;
        this.loadUsageData();
    }

    async loadUsageData() {
        try {
            if (this.currentUserId === 'default_user') {
                const currentDate = new Date();
                const currentMonth = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1);
                this.usageData = {
                    monthlyRequests: 0,
                    lastResetDate: currentDate.toISOString(),
                    currentMonth: currentMonth
                };
                this.currentPlan = 'free';
                return;
            }

            const db = getFirestoreInstance();
            const userRef = doc(db, 'users', this.currentUserId);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const userData = userSnap.data();
                this.usageData = userData.usageLimit || {
                    monthlyRequests: 0,
                    lastResetDate: new Date().toISOString(),
                    currentMonth: new Date().getFullYear() + '-' + (new Date().getMonth() + 1)
                };
                this.currentPlan = userData.plan || 'free';
                console.log(`[FirestoreUsageService] Loaded usage data for user ${this.currentUserId}:`, this.usageData);
                
                this.checkAndResetMonthlyCount();
            } else {
                console.log(`[FirestoreUsageService] Creating new user document for ${this.currentUserId}`);
                const currentDate = new Date();
                const currentMonth = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1);
                
                const initialUserData = {
                    usageLimit: {
                        monthlyRequests: 0,
                        lastResetDate: currentDate.toISOString(),
                        currentMonth: currentMonth
                    },
                    plan: 'free',
                    createdAt: serverTimestamp(),
                    isAnonymous: this.isCurrentUserAnonymous()
                };
                
                await setDoc(userRef, initialUserData);
                this.usageData = initialUserData.usageLimit;
                this.currentPlan = 'free';
            }
        } catch (error) {
            console.error('Error loading usage data from Firestore:', error);
            const currentDate = new Date();
            const currentMonth = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1);
            this.usageData = {
                monthlyRequests: 0,
                lastResetDate: currentDate.toISOString(),
                currentMonth: currentMonth
            };
            this.currentPlan = 'free';
        }
    }

    isCurrentUserAnonymous() {
        const authService = require('./authService');
        const currentUser = authService.getCurrentUser();
        return currentUser?.isAnonymous || false;
    }

    async saveUsageData() {
        try {
            if (this.currentUserId === 'default_user') {
                console.log('[FirestoreUsageService] Skipping save for default user');
                return;
            }

            const db = getFirestoreInstance();
            const userRef = doc(db, 'users', this.currentUserId);
            
            // First try to get the document to see if it exists
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
                // Update existing document
                await updateDoc(userRef, {
                    usageLimit: this.usageData,
                    updatedAt: serverTimestamp()
                });
            } else {
                // Create new document with default user data
                const { getFirebaseAuth } = require('./firebaseClient');
                const auth = getFirebaseAuth();
                const currentUser = auth.currentUser;
                
                await setDoc(userRef, {
                    displayName: currentUser?.displayName || 'User',
                    email: currentUser?.email || 'no-email@example.com',
                    plan: this.currentPlan,
                    usageLimit: this.usageData,
                    sessionData: {},
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }
            
            console.log(`[FirestoreUsageService] Saved usage data for user ${this.currentUserId}:`, this.usageData);
        } catch (error) {
            console.error('Error saving usage data to Firestore:', error);
        }
    }

    async checkAndResetMonthlyCount() {
        const currentDate = new Date();
        const currentMonth = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1);
        
        if (this.usageData.currentMonth !== currentMonth) {
            console.log(`[FirestoreUsageService] Month changed from ${this.usageData.currentMonth} to ${currentMonth}, resetting usage`);
            this.usageData.monthlyRequests = 0;
            this.usageData.currentMonth = currentMonth;
            this.usageData.lastResetDate = currentDate.toISOString();
            await this.saveUsageData();
        } else {
            console.log(`[FirestoreUsageService] Same month (${currentMonth}), keeping usage at ${this.usageData.monthlyRequests}`);
        }
    }

    async setCurrentPlan(planName) {
        this.currentPlan = planName;
        
        if (this.currentUserId === 'default_user') {
            return;
        }

        try {
            const db = getFirestoreInstance();
            const userRef = doc(db, 'users', this.currentUserId);
            
            await updateDoc(userRef, {
                plan: planName,
                updatedAt: serverTimestamp()
            });
            
            console.log(`[FirestoreUsageService] Updated plan for user ${this.currentUserId}: ${planName}`);
        } catch (error) {
            console.error('Error updating plan in Firestore:', error);
        }
    }

    getCurrentPlan() {
        return this.currentPlan;
    }

    getPlanDetails(planName = null) {
        const { SUBSCRIPTION_PLANS } = require('../config/centralizedKeys.js');
        const plan = planName || this.currentPlan;
        return SUBSCRIPTION_PLANS[plan] || SUBSCRIPTION_PLANS.free;
    }

    async canMakeRequest() {
        await this.checkAndResetMonthlyCount();
        
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

    async recordRequest() {
        await this.checkAndResetMonthlyCount();
        this.usageData.monthlyRequests++;
        await this.saveUsageData();
        
        const userType = this.isCurrentUserAnonymous() ? 'anonymous' : 
                        this.currentUserId === 'default_user' ? 'default' : 'authenticated';
        console.log(`[FirestoreUsageService] Request recorded for ${userType} user ${this.currentUserId}. Monthly count: ${this.usageData.monthlyRequests}`);
    }

    async getUsageStats() {
        await this.checkAndResetMonthlyCount();
        
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

    async resetUsage() {
        console.log(`[FirestoreUsageService] 🚨 RESETTING USAGE for user ${this.currentUserId}`);
        this.usageData.monthlyRequests = 0;
        this.usageData.currentMonth = new Date().getFullYear() + '-' + (new Date().getMonth() + 1);
        this.usageData.lastResetDate = new Date().toISOString();
        await this.saveUsageData();
    }
}

const firestoreUsageService = new FirestoreUsageService();
module.exports = firestoreUsageService;