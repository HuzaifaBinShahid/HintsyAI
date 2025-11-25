const { onAuthStateChanged, signInWithCustomToken, signOut } = require('firebase/auth');
const { BrowserWindow, shell } = require('electron');
const { getFirebaseAuth } = require('./firebaseClient');
const fetch = require('node-fetch');
const encryptionService = require('./encryptionService');
const migrationService = require('./migrationService');
const sessionRepository = require('../repositories/session');
const providerSettingsRepository = require('../repositories/providerSettings');
const permissionService = require('./permissionService');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { SUBSCRIPTION_PLANS } = require('../config/centralizedKeys');

async function getVirtualKeyByEmail(email, idToken) {
    if (!idToken) {
        throw new Error('Firebase ID token is required for virtual key request');
    }

    const resp = await fetch('https://serverless-api-sf3o.vercel.app/api/virtual_key', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
        redirect: 'follow',
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        console.error('[VK] API request failed:', json.message || 'Unknown error');
        throw new Error(json.message || `HTTP ${resp.status}: Virtual key request failed`);
    }

    const vKey = json?.data?.virtualKey || json?.data?.virtual_key || json?.data?.newVKey?.slug;

    if (!vKey) throw new Error('virtual key missing in response');
    return vKey;
}

class AuthService {
    constructor() {
        this.currentUserId = 'default_user';
        this.currentUserMode = 'local'; // 'local', 'anonymous', or 'firebase'
        this.currentUser = null;
        this.isInitialized = false;

        this.initializationPromise = null;
        this.persistentAnonymousFilePath = path.join(os.homedir(), '.hintsy_anonymous_user.json');

        sessionRepository.setAuthService(this);
    }

    initialize() {
        if (this.isInitialized) return this.initializationPromise;

        this.initializationPromise = new Promise((resolve) => {
            const auth = getFirebaseAuth();
            onAuthStateChanged(auth, async (user) => {
                const previousUser = this.currentUser;

                if (user) {
                    if (user.isAnonymous) {
                        console.log(`[AuthService] Anonymous user detected:`, user.uid);
                        this.currentUser = user;
                        this.currentUserId = user.uid;
                        this.currentUserMode = 'anonymous';
                        
                        const firestoreUsageService = require('./firestoreUsageService');
                        firestoreUsageService.setCurrentUser(user.uid);
                        
                        await sessionRepository.endAllActiveSessions();
                        encryptionService.resetSessionKey();
                    } else {
                        console.log(`[AuthService] Authenticated user signed in:`, user.uid);
                        
                        // Store the previous anonymous user ID before switching
                        const previousAnonymousUserId = (this.currentUserMode === 'anonymous') ? this.currentUserId : null;
                        
                        this.currentUser = user;
                        this.currentUserId = user.uid;
                        this.currentUserMode = 'firebase';
                        
                        const firestoreUsageService = require('./firestoreUsageService');
                        
                        // If user was previously anonymous, transfer their usage data
                        if (previousAnonymousUserId && previousAnonymousUserId !== user.uid) {
                            console.log('[AuthService] Transferring data from anonymous user:', previousAnonymousUserId, 'to authenticated user:', user.uid);
                            await this.transferAnonymousUserData(previousAnonymousUserId, user.uid);
                            
                            // Delete the persistent anonymous user file after successful login
                            this.deletePersistentAnonymousUser();
                        }
                        
                        firestoreUsageService.setCurrentUser(user.uid);
                        
                        await this.handleAccountLinking(user);
                        
                        await this.checkForPendingUpgrades(user.uid);
                        await this.syncPlanFromWeb(user.uid);
                        await sessionRepository.endAllActiveSessions();

                        if (process.platform === 'darwin' && !(await permissionService.checkKeychainCompleted(this.currentUserId))) {
                            console.warn('[AuthService] Keychain permission not yet completed for this user. Deferring key initialization.');
                        } else {
                            await encryptionService.initializeKey(user.uid);
                        }

                        migrationService.checkAndRunMigration(user);

                        try {
                            const idToken = await user.getIdToken(true);
                            const virtualKey = await getVirtualKeyByEmail(user.email, idToken);

                            if (global.modelStateService) {
                                await global.modelStateService.setFirebaseVirtualKey(virtualKey);
                            }
                            console.log(`[AuthService] Virtual key for ${user.email} has been processed and state updated.`);

                        } catch (error) {
                            console.error('[AuthService] Failed to fetch or save virtual key:', error);
                        }
                    }
                } else {
                    console.log(`[AuthService] No user found, checking for persistent anonymous user...`);
                    
                    // First check if we have a persistent anonymous user
                    const persistentAnonymousUser = this.loadPersistentAnonymousUser();
                    if (persistentAnonymousUser) {
                        console.log('[AuthService] Using existing persistent anonymous user:', persistentAnonymousUser.uid);
                        this.currentUser = persistentAnonymousUser;
                        this.currentUserId = persistentAnonymousUser.uid;
                        this.currentUserMode = 'anonymous';
                        
                        const firestoreUsageService = require('./firestoreUsageService');
                        firestoreUsageService.setCurrentUser(persistentAnonymousUser.uid);
                        
                        await sessionRepository.endAllActiveSessions();
                        encryptionService.resetSessionKey();
                    } else {
                        console.log('[AuthService] No persistent anonymous user found, creating new one...');
                        try {
                            const anonymousUser = await this.createAnonymousUser();
                            if (anonymousUser) {
                                console.log('[AuthService] Anonymous user setup completed');
                                this.broadcastUserState();
                                console.log('[AuthService] Anonymous user initialization finished');
                            }
                        } catch (error) {
                            console.error('[AuthService] Failed to create anonymous user, falling back to default');
                            this.fallbackToDefaultUser();
                        }
                    }
                }
                
                this.broadcastUserState();
                
                if (!this.isInitialized) {
                    this.isInitialized = true;
                    console.log('[AuthService] Initialized and resolved initialization promise.');
                    resolve();
                } else {
                    console.log('[AuthService] Already initialized, skipping resolve.');
                }
            });
        });

        return this.initializationPromise;
    }

    // Persistent anonymous user storage methods
    savePersistentAnonymousUser(userData) {
        try {
            const data = {
                uid: userData.uid,
                isAnonymous: userData.isAnonymous,
                email: userData.email,
                displayName: userData.displayName,
                createdAt: new Date().toISOString()
            };
            fs.writeFileSync(this.persistentAnonymousFilePath, JSON.stringify(data, null, 2));
            console.log('[AuthService] Saved persistent anonymous user:', userData.uid);
        } catch (error) {
            console.error('[AuthService] Failed to save persistent anonymous user:', error);
        }
    }

    loadPersistentAnonymousUser() {
        try {
            if (fs.existsSync(this.persistentAnonymousFilePath)) {
                const data = JSON.parse(fs.readFileSync(this.persistentAnonymousFilePath, 'utf8'));
                console.log('[AuthService] Loaded persistent anonymous user:', data.uid);
                return {
                    uid: data.uid,
                    isAnonymous: true,
                    email: data.email,
                    displayName: data.displayName
                };
            }
        } catch (error) {
            console.error('[AuthService] Failed to load persistent anonymous user:', error);
        }
        return null;
    }

    deletePersistentAnonymousUser() {
        try {
            if (fs.existsSync(this.persistentAnonymousFilePath)) {
                fs.unlinkSync(this.persistentAnonymousFilePath);
                console.log('[AuthService] Deleted persistent anonymous user file');
            }
        } catch (error) {
            console.error('[AuthService] Failed to delete persistent anonymous user file:', error);
        }
    }

    async createAnonymousUser() {
        try {
            const auth = getFirebaseAuth();
            const { signInAnonymously } = require('firebase/auth');
            
            console.log('[AuthService] Creating anonymous user...');
            const result = await signInAnonymously(auth);
            
            console.log('[AuthService] Anonymous user created:', result.user.uid);
            
            // Save the Firebase anonymous user persistently
            this.savePersistentAnonymousUser(result.user);
            
            return result.user;
        } catch (error) {
            console.error('[AuthService] Failed to create anonymous user:', error);
            
            if (error.code === 'auth/admin-restricted-operation' || 
                error.code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.' ||
                error.code?.includes('api-key-not-valid')) {
                console.log('[AuthService] Firebase auth issue. Creating local anonymous user...');
                return this.createLocalAnonymousUser();
            }
            throw error;
        }
    }

    createLocalAnonymousUser() {
        const crypto = require('crypto');
        const anonymousUid = 'anon_' + crypto.randomBytes(16).toString('hex');
        
        console.log('[AuthService] Created local anonymous user:', anonymousUid);
        
        const mockUser = {
            uid: anonymousUid,
            isAnonymous: true,
            email: null,
            displayName: null
        };

        // Save the local anonymous user persistently
        this.savePersistentAnonymousUser(mockUser);

        this.currentUser = mockUser;
        this.currentUserId = anonymousUid;
        this.currentUserMode = 'anonymous';
        
        const firestoreUsageService = require('./firestoreUsageService');
        firestoreUsageService.setCurrentUser(anonymousUid);

        return mockUser;
    }

    async handleAccountLinking(authenticatedUser) {
        try {
            console.log('[AuthService] Handling account linking for user:', authenticatedUser.uid);
            
            // Check if this user was previously anonymous and had usage data
            const firestoreUsageService = require('./firestoreUsageService');
            
            // The Firebase Auth linking should preserve the same UID, but let's verify the data exists
            console.log('[AuthService] Checking if linked user has existing usage data...');
            
            // Load usage data for the authenticated user (which should be the same UID as the anonymous user)
            await firestoreUsageService.loadUsageData();
            const currentUsage = firestoreUsageService.getUsageStats();
            
            console.log('[AuthService] Linked user usage data:', currentUsage);
            
            // Update the user document to mark it as no longer anonymous
            if (currentUsage.used > 0) {
                console.log('[AuthService] User has existing usage data - preserving it after account linking');
                await this.updateUserDocumentAfterLinking(authenticatedUser.uid);
            }
            
        } catch (error) {
            console.error('[AuthService] Account linking error:', error);
        }
    }
    
    async updateUserDocumentAfterLinking(userId) {
        try {
            const { doc, updateDoc, serverTimestamp } = require('firebase/firestore');
            const { getFirestoreInstance } = require('./firebaseClient');
            
            const db = getFirestoreInstance();
            const userRef = doc(db, 'users', userId);
            
            await updateDoc(userRef, {
                isAnonymous: false,
                linkedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            
            console.log('[AuthService] Updated user document after account linking:', userId);
        } catch (error) {
            console.error('[AuthService] Error updating user document after linking:', error);
        }
    }

    async transferAnonymousUserData(fromUserId, toUserId) {
        try {
            console.log('[AuthService] Starting data transfer from', fromUserId, 'to', toUserId);
            
            const { doc, getDoc, setDoc, deleteDoc, serverTimestamp } = require('firebase/firestore');
            const { getFirestoreInstance } = require('./firebaseClient');
            
            const db = getFirestoreInstance();
            
            // Get the anonymous user's data
            const fromUserRef = doc(db, 'users', fromUserId);
            const fromUserSnap = await getDoc(fromUserRef);
            
            if (!fromUserSnap.exists()) {
                console.log('[AuthService] No anonymous user data found to transfer');
                return;
            }
            
            const anonymousData = fromUserSnap.data();
            console.log('[AuthService] Anonymous user data to transfer:', anonymousData);
            
            // Check if authenticated user already has data
            const toUserRef = doc(db, 'users', toUserId);
            const toUserSnap = await getDoc(toUserRef);
            
            let transferredData;
            if (toUserSnap.exists()) {
                // SECURITY FIX: Prevent unlimited request abuse by accumulating usage instead of taking maximum
                const existingData = toUserSnap.data();
                const existingUsage = existingData.usageLimit?.monthlyRequests || 0;
                const anonymousUsage = anonymousData.usageLimit?.monthlyRequests || 0;
                
                // ADD usage counts together (not take maximum) to prevent bypass
                const combinedUsage = existingUsage + anonymousUsage;
                
                // Get user's current plan to determine limits
                const currentPlan = existingData.currentPlan || 'free';
                const planDetails = SUBSCRIPTION_PLANS[currentPlan] || SUBSCRIPTION_PLANS.free;
                const monthlyLimit = planDetails.monthlyRequests;
                
                // Cap usage at subscription limit (prevent going over plan limits)
                const finalUsage = monthlyLimit === -1 ? combinedUsage : Math.min(combinedUsage, monthlyLimit);
                
                // Track transfer history for abuse prevention and monitoring
                const transferHistory = existingData.transferHistory || [];
                transferHistory.push({
                    fromUserId: fromUserId,
                    anonymousUsage: anonymousUsage,
                    existingUsage: existingUsage,
                    combinedUsage: combinedUsage,
                    finalUsage: finalUsage,
                    transferredAt: new Date().toISOString(),
                    planAtTransfer: currentPlan,
                    planLimit: monthlyLimit
                });
                
                transferredData = {
                    ...existingData,
                    usageLimit: {
                        ...existingData.usageLimit,
                        monthlyRequests: finalUsage
                    },
                    transferHistory: transferHistory,
                    isAnonymous: false,
                    transferredFrom: fromUserId,
                    transferredAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                
                console.log('[AuthService] SECURITY FIX: Adding usage counts - existing:', existingUsage, 'anonymous:', anonymousUsage, 'combined:', combinedUsage, 'final (capped):', finalUsage);
            }
         else {
                // Create new document with anonymous user's data`
                transferredData = {
                    ...anonymousData,
                    isAnonymous: false,
                    transferredFrom: fromUserId,
                    transferredAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                
                console.log('[AuthService] Creating new user document with transferred usage:', anonymousData.usageLimit?.monthlyRequests || 0);
            }
            
            // Save the transferred data to the authenticated user
            await setDoc(toUserRef, transferredData);
            console.log('[AuthService] Successfully transferred data to authenticated user');
            
            // Archive the anonymous user data instead of deleting it
            const archiveRef = doc(db, 'archived_users', fromUserId);
            await setDoc(archiveRef, {
                ...anonymousData,
                archivedAt: serverTimestamp(),
                transferredTo: toUserId
            });
            
            // Delete the original anonymous user document
            await deleteDoc(fromUserRef);
            console.log('[AuthService] Archived and cleaned up anonymous user document');
            
        } catch (error) {
            console.error('[AuthService] Error transferring anonymous user data:', error);
        }
    }

    fallbackToDefaultUser() {
        this.currentUser = null;
        this.currentUserId = 'default_user';
        this.currentUserMode = 'local';
        
        const firestoreUsageService = require('./firestoreUsageService');
        firestoreUsageService.setCurrentUser('default_user');
    }

    async startFirebaseAuthFlow() {
        try {
            // Use dynamic web URL from environment
            // Use Hintsy_AI_URL for deployment or localhost for development
            const { getWebUrl } = require('../../../utils/webUrl');
        const authUrl = `${getWebUrl()}/login?mode=electron`;
            console.log(`[AuthService] Opening Firebase auth URL in browser: ${authUrl}`);
            await shell.openExternal(authUrl);
            return { success: true };
        } catch (error) {
            console.error('[AuthService] Failed to open Firebase auth URL:', error);
            return { success: false, error: error.message };
        }
    }

    async signInWithCustomToken(token) {
        const auth = getFirebaseAuth();
        try {
            const userCredential = await signInWithCustomToken(auth, token);
            console.log(`[AuthService] Successfully signed in with custom token for user:`, userCredential.user.uid);
            // onAuthStateChanged will handle the state update and broadcast
        } catch (error) {
            console.error('[AuthService] Error signing in with custom token:', error);
            throw error; // Re-throw to be handled by the caller
        }
    }

    // Replace the signOut method with this improved version that immediately cleans up state

async signOut() {
    const auth = getFirebaseAuth();
    try {
        console.log('[AuthService] Starting sign-out process...');
        console.log('[AuthService] Current user before signout:', this.currentUser?.uid);
        console.log('[AuthService] Current user mode before signout:', this.currentUserMode);
        
        // Store current user for cleanup operations
        const currentUser = this.currentUser;
        
        // End all active sessions for the current user BEFORE signing out.
        await sessionRepository.endAllActiveSessions();
        console.log('[AuthService] Ended all active sessions.');

        // Import the Firebase signOut function with a different name to avoid conflict
        const { signOut: firebaseSignOut } = require('firebase/auth');
        
        // Sign out from Firebase
        await firebaseSignOut(auth);
        console.log('[AuthService] Firebase sign-out completed successfully.');
        
        // IMMEDIATELY clean up local state (don't wait for onAuthStateChanged)
        console.log('[AuthService] Immediately cleaning up local state...');
        await this.performSignOutCleanup(currentUser);
        
        console.log('[AuthService] Sign-out process completed successfully.');
        
    } catch (error) {
        console.error('[AuthService] Error during sign-out:', error);
        
        // Force cleanup if Firebase signOut fails
        console.log('[AuthService] Forcing local state cleanup due to sign-out error...');
        await this.forceLocalSignOut();
    }
}

// Extract the cleanup logic into a reusable method
async performSignOutCleanup(previousUser = null) {
    console.log('[AuthService] Performing sign-out cleanup...');
    
    if (previousUser && global.modelStateService) {
        try {
            console.log(`[AuthService] Clearing virtual key for user: ${previousUser.uid}`);
            await global.modelStateService.setFirebaseVirtualKey(null);
            console.log('[AuthService] Virtual key cleared successfully');
        } catch (keyError) {
            console.error('[AuthService] Error clearing virtual key:', keyError);
        }
    }
    
    // Don't immediately create a new anonymous user after sign-out
    // Instead, reset to default and let the next app start handle anonymous user creation
    // This prevents creating multiple anonymous users and respects the persistent storage
    console.log('[AuthService] Resetting to default user after sign-out...');
    this.fallbackToDefaultUser();
    
    await sessionRepository.endAllActiveSessions();
    console.log('[AuthService] Ended all active sessions');

    encryptionService.resetSessionKey();
    console.log('[AuthService] Reset session key');
    
    this.broadcastUserState();
    console.log('[AuthService] Broadcasted updated user state');
    
    const finalState = this.getCurrentUser();
    console.log('[AuthService] Final user state after cleanup:', finalState);
}

// Update forceLocalSignOut to use the shared cleanup method
async forceLocalSignOut() {
    console.log('[AuthService] Forcing local sign-out cleanup...');
    
    const previousUser = this.currentUser;
    await this.performSignOutCleanup(previousUser);
    
    console.log('[AuthService] Force sign-out completed');
}
    
    async checkForPendingUpgrades(userId) {
        try {
            console.log(`[AuthService] Checking for pending upgrades for user: ${userId}`);
            console.log(`[AuthService] Current working directory: ${process.cwd()}`);
            const fs = require('fs');
            const path = require('path');
            // Use the pickleglass_web directory for the upgrade file
            const upgradeFile = path.join(process.cwd(), 'pickleglass_web', 'user-upgrades.json');
            console.log(`[AuthService] Looking for upgrade file at: ${upgradeFile}`);
            
            if (!fs.existsSync(upgradeFile)) {
                console.log(`[AuthService] No upgrade file found, skipping upgrade check`);
                return;
            }
            
            const data = fs.readFileSync(upgradeFile, 'utf8');
            const upgrades = JSON.parse(data);
            console.log(`[AuthService] Upgrade file contents:`, upgrades);
            
            if (upgrades[userId]) {
                console.log(`[AuthService] Found pending upgrade for user ${userId}:`, upgrades[userId]);
                
                // Get current plan before upgrading
                const firestoreUsageService = require('./firestoreUsageService');
                const previousPlan = firestoreUsageService.getCurrentPlan();
                
                // Activate the pro plan
                await firestoreUsageService.setCurrentPlan('pro');
                
                // Only reset usage if this is actually a new upgrade (user was previously on free plan)
                if (previousPlan !== 'pro') {
                    console.log(`[AuthService] User upgraded from ${previousPlan} to pro, resetting usage`);
                    await firestoreUsageService.resetUsage();
                } else {
                    console.log(`[AuthService] User was already on pro plan, keeping existing usage`);
                }
                
                console.log(`[AuthService] ✅ Activated Pro plan for user ${userId}`);
                
                // Remove the processed upgrade
                delete upgrades[userId];
                fs.writeFileSync(upgradeFile, JSON.stringify(upgrades, null, 2));
                console.log(`[AuthService] Removed processed upgrade for user ${userId} from file`);
                
                // Broadcast the updated user state
                this.broadcastUserState();
            } else {
                console.log(`[AuthService] No pending upgrades found for user ${userId}`);
            }
        } catch (error) {
            console.error('[AuthService] Error checking for pending upgrades:', error);
        }
    }
    
    async syncPlanFromWeb(userId) {
        try {
            console.log(`[AuthService] Syncing plan from web API for user: ${userId}`);
            
            const webUrl = process.env.HINTSY_WEB_URL || 'http://localhost:3000';
            const apiUrl = `${webUrl}/api/user-plan?userId=${encodeURIComponent(userId)}`;
            
            console.log(`[AuthService] Calling web API: ${apiUrl}`);
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Web API returned ${response.status}: ${response.statusText}`);
            }
            
            const planData = await response.json();
            console.log(`[AuthService] Got plan data from web API:`, planData);
            
            if (planData.currentPlan === 'pro') {
                console.log(`[AuthService] User has Pro plan, updating local service`);
                const firestoreUsageService = require('./firestoreUsageService');
                await firestoreUsageService.setCurrentPlan('pro');
                console.log(`[AuthService] Successfully updated to Pro plan`);
            } else {
                console.log(`[AuthService] User has ${planData.currentPlan} plan, no update needed`);
            }
            
            console.log(`[AuthService] Plan sync completed for user: ${userId}`);
            return { success: true, plan: planData.currentPlan };
        } catch (error) {
            console.error('[AuthService] Error syncing plan from web:', error);
            return { success: false, error: error.message };
        }
    }
    
    async setAuthenticatedUser(userData) {
        try {
            console.log(`[AuthService] Setting authenticated user: ${userData.uid}`);
            
            // SECURITY FIX: Check if we need to transfer anonymous user data
            const previousAnonymousUserId = (this.currentUserMode === 'anonymous') ? this.currentUserId : null;
            
            // Update the current user state
            this.currentUser = {
                uid: userData.uid,
                email: userData.email,
                displayName: userData.displayName,
                idToken: userData.idToken
            };
            this.currentUserId = userData.uid;
            this.currentUserMode = 'firebase';
            
            // Set up Firestore usage service for this user
            const firestoreUsageService = require('./firestoreUsageService');
            await firestoreUsageService.setCurrentUser(userData.uid);
            
            // SECURITY FIX: Transfer anonymous user data if user was previously anonymous
            if (previousAnonymousUserId && previousAnonymousUserId !== userData.uid) {
                console.log('[AuthService] Transferring data from anonymous user:', previousAnonymousUserId, 'to authenticated user:', userData.uid);
                await this.transferAnonymousUserData(previousAnonymousUserId, userData.uid);
                
                // Delete the persistent anonymous user file after successful login
                this.deletePersistentAnonymousUser();
            }
            
            // Check for pending upgrades and sync plan
            await this.checkForPendingUpgrades(userData.uid);
            await this.syncPlanFromWeb(userData.uid);
            
            // Broadcast the state change
            this.broadcastUserState();
            
            console.log(`[AuthService] User ${userData.uid} authenticated successfully`);
        } catch (error) {
            console.error('[AuthService] Error setting authenticated user:', error);
            throw error;
        }
    }

    // Replace the broadcastUserState method with this debug version

broadcastUserState() {
    const userState = this.getCurrentUser();
    console.log('[AuthService] Broadcasting user state change:');
    console.log('[AuthService] - userState.isLoggedIn:', userState.isLoggedIn);
    console.log('[AuthService] - userState.uid:', userState.uid);
    console.log('[AuthService] - userState.mode:', userState.mode);
    console.log('[AuthService] - Full userState:', userState);
    
    try {
        const windowCount = BrowserWindow.getAllWindows().length;
        console.log(`[AuthService] Broadcasting to ${windowCount} windows`);
        
        BrowserWindow.getAllWindows().forEach((win, index) => {
            if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
                console.log(`[AuthService] Sending user-state-changed to window ${index}`);
                win.webContents.send('user-state-changed', userState);
            } else {
                console.log(`[AuthService] Skipping destroyed window ${index}`);
            }
        });
        
        console.log('[AuthService] Broadcast completed');
    } catch (error) {
        console.log('[AuthService] BrowserWindow not available (test mode), skipping broadcast');
    }
}

    getCurrentUserId() {
        return this.currentUserId;
    }

    // Replace the getCurrentUser method with this debug version

getCurrentUser() {
    const isLoggedIn = !!(this.currentUserMode === 'firebase' && this.currentUser);
    const isAnonymous = !!(this.currentUserMode === 'anonymous' && this.currentUser);
    
    console.log('[AuthService] getCurrentUser() called:');
    console.log('[AuthService] - currentUserMode:', this.currentUserMode);
    console.log('[AuthService] - currentUser exists:', !!this.currentUser);
    console.log('[AuthService] - currentUser uid:', this.currentUser?.uid || 'null');
    console.log('[AuthService] - calculated isLoggedIn:', isLoggedIn);
    console.log('[AuthService] - calculated isAnonymous:', isAnonymous);

    if (isLoggedIn) {
        const loggedInState = {
            uid: this.currentUser.uid,
            email: this.currentUser.email,
            displayName: this.currentUser.displayName,
            mode: 'firebase',
            isLoggedIn: true,
            isAnonymous: false
        };
        console.log('[AuthService] - returning logged in state:', loggedInState);
        return loggedInState;
    }
    
    if (isAnonymous) {
        const anonymousState = {
            uid: this.currentUser.uid,
            email: null,
            displayName: 'Anonymous User',
            mode: 'anonymous',
            isLoggedIn: false,
            isAnonymous: true
        };
        console.log('[AuthService] - returning anonymous state:', anonymousState);
        return anonymousState;
    }
    
    const loggedOutState = {
        uid: 'default_user',
        email: 'contact@pickle.com',
        displayName: 'Default User',
        mode: 'local',
        isLoggedIn: false,
        isAnonymous: false
    };
    console.log('[AuthService] - returning logged out state:', loggedOutState);
    return loggedOutState;
}
}

const authService = new AuthService();
module.exports = authService; 