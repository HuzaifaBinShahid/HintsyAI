console.log('🚀 [index.js] Starting application...');

// try {
//     const reloader = require('electron-reloader');
//     reloader(module, {
//     });
// } catch (err) {
// }

console.log('📦 [index.js] Loading dotenv...');
require('dotenv').config();
console.log('✅ [index.js] Dotenv loaded successfully');

// Handle uncaught exceptions to prevent app crashes
process.on('uncaughtException', (error) => {
    if (error.code === 'EIO' && error.message.includes('write')) {
        // Ignore write errors to stdout/stderr (often happens with npm scripts)
        return;
    }
    try {
        console.error('Uncaught Exception:', error);
    } catch (e) {
        // If console.error also fails, just ignore
    }
});

process.on('unhandledRejection', (reason, promise) => {
    try {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    } catch (e) {
        // If console.error fails, ignore
    }
});

// Handle stdout/stderr errors gracefully
if (process.stdout) {
    process.stdout.on('error', (err) => {
        if (err.code === 'EIO' || err.code === 'EPIPE') {
            // Ignore broken pipe errors
            return;
        }
    });
}

if (process.stderr) {
    process.stderr.on('error', (err) => {
        if (err.code === 'EIO' || err.code === 'EPIPE') {
            // Ignore broken pipe errors
            return;
        }
    });
}

if (require('electron-squirrel-startup')) {
    process.exit(0);
}

console.log('📦 [index.js] Loading Electron modules...');
const { app, BrowserWindow, shell, ipcMain, dialog, desktopCapturer, session } = require('electron');
console.log('✅ [index.js] Electron modules loaded successfully');

console.log('📦 [index.js] Loading internal modules...');
const { createWindows } = require('./window/windowManager.js');
const listenService = require('./features/listen/listenService');
const { initializeFirebase } = require('./features/common/services/firebaseClient');
const DatabaseInitializer = require('./features/common/services/databaseInitializer');
const authService = require('./features/common/services/authService');
const path = require('node:path');
const express = require('express');
const fetch = require('node-fetch');
// Lazy load autoUpdater to avoid early initialization
let autoUpdater = null;
const { EventEmitter } = require('events');
const askService = require('./features/ask/askService');
const settingsService = require('./features/settings/settingsService');
const sessionRepository = require('./features/common/repositories/session');
const modelStateService = require('./features/common/services/modelStateService');
const featureBridge = require('./bridge/featureBridge');
const windowBridge = require('./bridge/windowBridge');
console.log('✅ [index.js] Internal modules loaded successfully');

// Firestore user management function
async function createOrUpdateFirestoreUser(userData) {
    const { doc, getDoc, setDoc, serverTimestamp } = require('firebase/firestore');
    const { getFirestoreInstance } = require('./features/common/services/firebaseClient');
    
    try {
        const firestore = getFirestoreInstance();
        const userRef = doc(firestore, 'users', userData.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            // Update existing user
            await setDoc(userRef, {
                displayName: userData.displayName,
                email: userData.email,
                updatedAt: serverTimestamp()
            }, { merge: true });
            console.log('[Firestore] Updated existing user:', userData.uid);
        } else {
            // Create new user with full profile
            await setDoc(userRef, {
                uid: userData.uid,
                displayName: userData.displayName,
                email: userData.email,
                plan: 'free',
                usageLimit: {
                    monthlyRequests: 0,
                    lastResetDate: new Date().toISOString(),
                    currentMonth: new Date().getFullYear() + '-' + (new Date().getMonth() + 1)
                },
                sessionData: {},
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            console.log('[Firestore] Created new user:', userData.uid);
        }
    } catch (error) {
        console.error('[Firestore] Error creating/updating user:', error);
        throw error;
    }
}

// Global variables
const eventBridge = new EventEmitter();
global.eventBridge = eventBridge; // Make eventBridge globally accessible
let WEB_PORT = 3000;
let isShuttingDown = false;
let isConsoleDisabled = false;

// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('❌ [UNCAUGHT EXCEPTION]', error);
    console.error('❌ [UNCAUGHT EXCEPTION] Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [UNHANDLED REJECTION] Promise:', promise);
    console.error('❌ [UNHANDLED REJECTION] Reason:', reason);
});

// Safe console wrapper to prevent EIO errors during shutdown
function safeLog(...args) {
    if (!isConsoleDisabled) {
        try {
            console.log(...args);
        } catch (error) {
            // Ignore console errors during shutdown
        }
    }
}

function safeWarn(...args) {
    if (!isConsoleDisabled) {
        try {
            console.warn(...args);
        } catch (error) {
            // Ignore console errors during shutdown
        }
    }
}

function safeError(...args) {
    if (!isConsoleDisabled) {
        try {
            console.error(...args);
        } catch (error) {
            // Ignore console errors during shutdown
        }
    }
} // Flag to prevent infinite shutdown loop

//////// after_modelStateService ////////
global.modelStateService = modelStateService;
//////// after_modelStateService ////////

// Import and initialize OllamaService
const ollamaService = require('./features/common/services/ollamaService');
const ollamaModelRepository = require('./features/common/repositories/ollamaModel');

// Native deep link handling - cross-platform compatible
let pendingDeepLinkUrl = null;

function setupProtocolHandling() {
    // Protocol registration - must be done before app is ready
    try {
        const protocolName = 'pickleglass';
        
        // For production builds, we need to ensure proper protocol registration
        if (app.isPackaged) {
            // In production, force re-registration to ensure it works
            console.log('[Protocol] Production build detected, ensuring protocol registration...');
            
            // First, remove any existing registration to ensure clean state
            try {
                app.removeAsDefaultProtocolClient(protocolName);
                console.log('[Protocol] Removed existing protocol registration');
            } catch (e) {
                console.log('[Protocol] No existing registration to remove');
            }
            
            // Now register with full path to executable
            const success = app.setAsDefaultProtocolClient(protocolName, process.execPath);
            if (success) {
                console.log('[Protocol] Successfully set as default protocol client for pickleglass://');
                console.log('[Protocol] Executable path:', process.execPath);
            } else {
                console.warn('[Protocol] Failed to set as default protocol client - this may affect deep linking');
                
                // Try alternative registration method for production
                try {
                    // Try with different arguments for Windows compatibility
                    const retrySuccess = app.setAsDefaultProtocolClient(protocolName, process.execPath, []);
                    console.log('[Protocol] Retry registration result:', retrySuccess);
                    
                    if (!retrySuccess) {
                        // Final attempt with explicit arguments
                        const finalAttempt = app.setAsDefaultProtocolClient(protocolName, process.execPath, ['--protocol']);
                        console.log('[Protocol] Final registration attempt result:', finalAttempt);
                    }
                } catch (retryError) {
                    console.error('[Protocol] Retry registration failed:', retryError);
                }
            }
            
            // Verify registration worked
            setTimeout(() => {
                const isRegistered = app.isDefaultProtocolClient(protocolName);
                console.log('[Protocol] Protocol registration verification:', isRegistered);
                if (!isRegistered) {
                    console.warn('[Protocol] Protocol registration verification failed - deep linking may not work');
                }
            }, 1000);
        } else {
            // Development mode
            if (!app.isDefaultProtocolClient(protocolName)) {
                const success = app.setAsDefaultProtocolClient(protocolName);
                if (success) {
                    console.log('[Protocol] Successfully set as default protocol client for pickleglass://');
                } else {
                    console.warn('[Protocol] Failed to set as default protocol client - this may affect deep linking');
                }
            } else {
                console.log('[Protocol] Already registered as default protocol client for pickleglass://');
            }
        }

        // Log current protocol client status
        const isDefault = app.isDefaultProtocolClient(protocolName);
        console.log(`[Protocol] Current protocol client status: ${isDefault ? 'REGISTERED' : 'NOT REGISTERED'}`);
        
    } catch (error) {
        console.error('[Protocol] Error during protocol registration:', error);
    }

    // Handle protocol URLs on Windows/Linux
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        try {
            console.log('[Protocol] Second instance detected');
            console.log('[Protocol] Command line:', commandLine);
        } catch (err) {
            // Ignore console write errors
        }
        
        focusMainWindow();
        
        let protocolUrl = null;
        
        // Search through all command line arguments for a valid protocol URL
        for (const arg of commandLine) {
            if (arg && typeof arg === 'string' && arg.startsWith('pickleglass://')) {
                // Clean up the URL by removing problematic characters
                const cleanUrl = arg.replace(/[\\₩]/g, '');
                
                // Additional validation for Windows
                if (process.platform === 'win32') {
                    // On Windows, ensure the URL doesn't contain file path indicators
                    if (!cleanUrl.includes(':') || cleanUrl.indexOf('://') === cleanUrl.lastIndexOf(':')) {
                        protocolUrl = cleanUrl;
                        break;
                    }
                } else {
                    protocolUrl = cleanUrl;
                    break;
                }
            }
        }
        
        if (protocolUrl) {
            console.log('[Protocol] Valid URL found from second instance:', protocolUrl);
            // Add a small delay to ensure the app is fully ready
            setTimeout(() => {
                handleCustomUrl(protocolUrl);
            }, 500);
        } else {
            console.log('[Protocol] No valid protocol URL found in command line arguments');
            console.log('[Protocol] Available args:', commandLine);
        }
    });

    // Handle protocol URLs on macOS
    app.on('open-url', (event, url) => {
        event.preventDefault();
        console.log('[Protocol] Received URL via open-url:', url);
        
        if (!url || !url.startsWith('pickleglass://')) {
            console.warn('[Protocol] Invalid URL format:', url);
            return;
        }

        if (app.isReady()) {
            console.log('[Protocol] App is ready, handling URL immediately');
            handleCustomUrl(url);
        } else {
            console.log('[Protocol] App not ready, storing URL for later');
            pendingDeepLinkUrl = url;
        }
    });

    // Enhanced logging for debugging
    console.log('[Protocol] Protocol handling setup completed');
    console.log('[Protocol] Platform:', process.platform);
    console.log('[Protocol] Is packaged:', app.isPackaged);
    
    // Check current protocol registration status
    const isCurrentlyRegistered = app.isDefaultProtocolClient('pickleglass');
    console.log('[Protocol] Current protocol client status:', isCurrentlyRegistered ? 'REGISTERED' : 'NOT REGISTERED');
}

function focusMainWindow() {
    const { windowPool } = require('./window/windowManager.js');
    if (windowPool) {
        const header = windowPool.get('header');
        if (header && !header.isDestroyed()) {
            if (header.isMinimized()) header.restore();
            header.focus();
            return true;
        }
    }
    
    // Fallback: focus any available window
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        const mainWindow = windows[0];
        if (!mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            return true;
        }
    }
    
    return false;
}

if (process.platform === 'win32') {
    for (const arg of process.argv) {
        if (arg && typeof arg === 'string' && arg.startsWith('pickleglass://')) {
            // Clean up the URL by removing problematic characters (korean characters issue...)
            const cleanUrl = arg.replace(/[\\₩]/g, '');
            
            if (!cleanUrl.includes(':') || cleanUrl.indexOf('://') === cleanUrl.lastIndexOf(':')) {
                console.log('[Protocol] Found protocol URL in initial arguments:', cleanUrl);
                pendingDeepLinkUrl = cleanUrl;
                break;
            }
        }
    }
    
    console.log('[Protocol] Initial process.argv:', process.argv);
}

app.whenReady().then(async () => {
    // Check single instance lock
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
        app.quit();
        process.exit(0);
    }

    // setup protocol after single instance lock
    setupProtocolHandling();
    console.log('🚀 [index.js] App is ready, starting initialization...');

    // Setup native loopback audio capture for Windows
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
            // Grant access to the first screen found with loopback audio
            callback({ video: sources[0], audio: 'loopback' });
        }).catch((error) => {
            console.error('Failed to get desktop capturer sources:', error);
            callback({});
        });
    });

    // Initialize core services
    console.log('🔥 [index.js] Initializing Firebase...');
    initializeFirebase();
    
    try {
        console.log('🗄️ [index.js] Starting database initialization...');
        const databaseInitializer = new DatabaseInitializer();
        await databaseInitializer.initialize();
        console.log('✅ [index.js] Database initialized successfully');
        
        // Clean up zombie sessions from previous runs first - MOVED TO authService
        // sessionRepository.endAllActiveSessions();

        console.log('🔐 [index.js] Starting auth service initialization...');
        await authService.initialize();
        console.log('[index.js] AuthService initialization completed');

        //////// after_modelStateService ////////
        console.log('⚙️ [index.js] Starting model state service initialization...');
        await modelStateService.initialize();
        console.log('[index.js] ModelStateService initialization completed');
        //////// after_modelStateService ////////

        console.log('🌉 [index.js] Initializing feature bridge...');
        featureBridge.initialize();  // 추가: featureBridge 초기화
        console.log('✅ [index.js] Feature bridge initialized successfully');
        
        console.log('🪟 [index.js] Initializing window bridge...');
        windowBridge.initialize();
        console.log('✅ [index.js] Window bridge initialized successfully');
        
        console.log('📡 [index.js] Setting up web data handlers...');
        setupWebDataHandlers();
        
        // Initialize meeting detection service
        const meetingDetectionService = require('./features/common/services/meetingDetectionService');
        meetingDetectionService.startMonitoring();
        console.log('✅ [index.js] Web data handlers setup complete');

        console.log('[index.js] About to initialize Ollama models...');
        
        // Initialize Ollama models in database
        try {
            await ollamaModelRepository.initializeDefaultModels();
            console.log('[index.js] Ollama models initialized successfully');
        } catch (error) {
            console.error('[index.js] Ollama model initialization failed:', error);
        }

        console.log('[index.js] About to start web stack...');

        // Start web server and create windows ONLY after all initializations are successful
        try {
            WEB_PORT = await startWebStack();
            console.log('Web front-end listening on', WEB_PORT);
        } catch (error) {
            console.error('[index.js] Web stack startup failed:', error);
            // Continue without web stack to get UI working
            WEB_PORT = null;
        }
        
        console.log('[index.js] About to create windows...');
        createWindows();

        // Auto warm-up selected Ollama model in background (non-blocking)
        setTimeout(async () => {
            try {
                console.log('[index.js] Starting background Ollama model warm-up...');
                await ollamaService.autoWarmUpSelectedModel();
            } catch (error) {
                console.log('[index.js] Background warm-up failed (non-critical):', error.message);
            }
        }, 2000); // Wait 2 seconds after app start

    } catch (err) {
        console.error('❌ [index.js] Initialization failed:', err);
        console.error('❌ [index.js] Error stack:', err.stack);
        // Optionally, show an error dialog to the user
        dialog.showErrorBox(
            'Application Error',
            'A critical error occurred during startup. Some features might be disabled. Please restart the application.'
        );
    }

    // initAutoUpdater should be called after auth is initialized
    initAutoUpdater();

    // Process any pending deep link after everything is initialized
    if (pendingDeepLinkUrl) {
        console.log('[Protocol] Processing pending URL:', pendingDeepLinkUrl);
        handleCustomUrl(pendingDeepLinkUrl);
        pendingDeepLinkUrl = null;
    }
});

app.on('before-quit', async (event) => {
    // Prevent infinite loop by checking if shutdown is already in progress
    if (isShuttingDown) {
        safeLog('[Shutdown] 🔄 Shutdown already in progress, allowing quit...');
        return;
    }
    
    safeLog('[Shutdown] App is about to quit. Starting graceful shutdown...');
    
    // Set shutdown flag to prevent infinite loop
    isShuttingDown = true;
    
    // Prevent immediate quit to allow graceful shutdown
    event.preventDefault();
    
    try {
        // 1. Stop audio capture first (immediate)
        await listenService.closeSession();
        safeLog('[Shutdown] Audio capture stopped');
        
        // 2. End all active sessions (database operations) - with error handling
        try {
            await sessionRepository.endAllActiveSessions();
            safeLog('[Shutdown] Active sessions ended');
        } catch (dbError) {
            safeWarn('[Shutdown] Could not end active sessions (database may be closed):', dbError.message);
        }
        
        // 3. Shutdown Ollama service (potentially time-consuming)
        safeLog('[Shutdown] shutting down Ollama service...');
        const ollamaShutdownSuccess = await Promise.race([
            ollamaService.shutdown(false), // Graceful shutdown
            new Promise(resolve => setTimeout(() => resolve(false), 8000)) // 8s timeout
        ]);
        
        if (ollamaShutdownSuccess) {
            safeLog('[Shutdown] Ollama service shut down gracefully');
        } else {
            safeLog('[Shutdown] Ollama shutdown timeout, forcing...');
            // Force shutdown if graceful failed
            try {
                await ollamaService.shutdown(true);
            } catch (forceShutdownError) {
                safeWarn('[Shutdown] Force shutdown also failed:', forceShutdownError.message);
            }
        }
        
        // 4. Close database connections (final cleanup)
        try {
            databaseInitializer.close();
            safeLog('[Shutdown] Database connections closed');
        } catch (closeError) {
            safeWarn('[Shutdown] Error closing database:', closeError.message);
        }
        
        safeLog('[Shutdown] Graceful shutdown completed successfully');
        
    } catch (error) {
        safeError('[Shutdown] Error during graceful shutdown:', error);
        // Continue with shutdown even if there were errors
    } finally {
        // Disable console logging to prevent EIO errors
        isConsoleDisabled = true;
        
        // Actually quit the app now
        safeLog('[Shutdown] Exiting application...');
        app.exit(0); // Use app.exit() instead of app.quit() to force quit
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindows();
    }
});

function setupWebDataHandlers() {
    const sessionRepository = require('./features/common/repositories/session');
    const sttRepository = require('./features/listen/stt/repositories');
    const summaryRepository = require('./features/listen/summary/repositories');
    const askRepository = require('./features/ask/repositories');
    const userRepository = require('./features/common/repositories/user');
    const presetRepository = require('./features/common/repositories/preset');

    const handleRequest = async (channel, responseChannel, payload) => {
        let result;
        // const currentUserId = authService.getCurrentUserId(); // No longer needed here
        try {
            switch (channel) {
                // SESSION
                case 'get-sessions':
                    // Adapter injects UID
                    result = await sessionRepository.getAllByUserId();
                    break;
                case 'get-session-details':
                    const session = await sessionRepository.getById(payload);
                    if (!session) {
                        result = null;
                        break;
                    }
                    const [transcripts, ai_messages, summary] = await Promise.all([
                        sttRepository.getAllTranscriptsBySessionId(payload),
                        askRepository.getAllAiMessagesBySessionId(payload),
                        summaryRepository.getSummaryBySessionId(payload)
                    ]);
                    result = { session, transcripts, ai_messages, summary };
                    break;
                case 'delete-session':
                    result = await sessionRepository.deleteWithRelatedData(payload);
                    break;
                case 'create-session':
                    // Adapter injects UID
                    const id = await sessionRepository.create('ask');
                    if (payload && payload.title) {
                        await sessionRepository.updateTitle(id, payload.title);
                    }
                    result = { id };
                    break;
                
                // USER
                case 'get-user-profile':
                    // Adapter injects UID
                    result = await userRepository.getById();
                    break;
                case 'update-user-profile':
                     // Adapter injects UID
                    result = await userRepository.update(payload);
                    break;
                case 'find-or-create-user':
                    result = await userRepository.findOrCreate(payload);
                    break;
                case 'save-api-key':
                    // Use ModelStateService as the single source of truth for API key management
                    result = await modelStateService.setApiKey(payload.provider, payload.apiKey);
                    break;
                case 'check-api-key-status':
                    // Use ModelStateService to check API key status
                    const hasApiKey = await modelStateService.hasValidApiKey();
                    result = { hasApiKey };
                    break;
                case 'delete-account':
                    // Adapter injects UID
                    result = await userRepository.deleteById();
                    break;

                // PRESET
                case 'get-presets':
                    // Adapter injects UID
                    result = await presetRepository.getPresets();
                    break;
                case 'create-preset':
                    // Adapter injects UID
                    result = await presetRepository.create(payload);
                    settingsService.notifyPresetUpdate('created', result.id, payload.title);
                    break;
                case 'update-preset':
                    // Adapter injects UID
                    result = await presetRepository.update(payload.id, payload.data);
                    settingsService.notifyPresetUpdate('updated', payload.id, payload.data.title);
                    break;
                case 'delete-preset':
                    // Adapter injects UID
                    result = await presetRepository.delete(payload);
                    settingsService.notifyPresetUpdate('deleted', payload);
                    break;
                
                // BATCH
                case 'get-batch-data':
                    const includes = payload ? payload.split(',').map(item => item.trim()) : ['profile', 'presets', 'sessions'];
                    const promises = {};
            
                    if (includes.includes('profile')) {
                        // Adapter injects UID
                        promises.profile = userRepository.getById();
                    }
                    if (includes.includes('presets')) {
                        // Adapter injects UID
                        promises.presets = presetRepository.getPresets();
                    }
                    if (includes.includes('sessions')) {
                        // Adapter injects UID
                        promises.sessions = sessionRepository.getAllByUserId();
                    }
                    
                    const batchResult = {};
                    const promiseResults = await Promise.all(Object.values(promises));
                    Object.keys(promises).forEach((key, index) => {
                        batchResult[key] = promiseResults[index];
                    });

                    result = batchResult;
                    break;

                default:
                    throw new Error(`Unknown web data channel: ${channel}`);
            }
            eventBridge.emit(responseChannel, { success: true, data: result });
        } catch (error) {
            console.error(`Error handling web data request for ${channel}:`, error);
            eventBridge.emit(responseChannel, { success: false, error: error.message });
        }
    };
    
    eventBridge.on('web-data-request', handleRequest);
}

async function handleCustomUrl(url) {
    try {
        console.log('[Custom URL] Processing URL:', url);
        
        // Enhanced validation and cleaning
        if (!url || typeof url !== 'string' || !url.startsWith('pickleglass://')) {
            console.error('[Custom URL] Invalid URL format:', url);
            return;
        }
        
        // Clean up URL by removing problematic characters
        const cleanUrl = url.replace(/[\\₩]/g, '');
        
        // Additional validation
        if (cleanUrl !== url) {
            console.log('[Custom URL] Cleaned URL from:', url, 'to:', cleanUrl);
            url = cleanUrl;
        }
        
        // Parse URL with better error handling
        let urlObj;
        try {
            urlObj = new URL(url);
        } catch (parseError) {
            console.error('[Custom URL] Failed to parse URL:', parseError);
            return;
        }
        
        const action = urlObj.hostname;
        const params = Object.fromEntries(urlObj.searchParams);
        
        console.log('[Custom URL] Action:', action);
        console.log('[Custom URL] Params:', Object.keys(params));

        switch (action) {
            case 'login':
            case 'auth-success':
                console.log('[Custom URL] Handling authentication callback...');
                await handleFirebaseAuthCallback(params);
                break;
            case 'personalize':
                console.log('[Custom URL] Handling personalization...');
                handlePersonalizeFromUrl(params);
                break;
            default:
                console.log('[Custom URL] Handling generic navigation to:', action);
                const { windowPool } = require('./window/windowManager.js');
                const header = windowPool.get('header');
                if (header) {
                    if (header.isMinimized()) header.restore();
                    header.focus();
                    
                    const { getWebUrl } = require("./utils/webUrl");
                    const targetUrl = `${getWebUrl()}/${action}`;
                    console.log(`[Custom URL] Navigating webview to: ${targetUrl}`);
                    header.webContents.loadURL(targetUrl);
                }
        }

    } catch (error) {
        console.error('[Custom URL] Error processing URL:', error);
        console.error('[Custom URL] Stack trace:', error.stack);
        
        // Focus the main window even if URL processing fails
        try {
            const { windowPool } = require('./window/windowManager.js');
            const header = windowPool.get('header');
            if (header) {
                if (header.isMinimized()) header.restore();
                header.focus();
            }
        } catch (focusError) {
            console.error('[Custom URL] Failed to focus window:', focusError);
        }
    }
}

async function handleFirebaseAuthCallback(params) {
    const { token: idToken, returnUrl, uid, email, displayName } = params;

    if (!idToken || !uid) {
        console.error('[Auth] Firebase auth callback is missing required data.');
        return;
    }

    console.log('[Auth] Received auth data from deep link, setting up user session...');
    if (returnUrl) {
        console.log('[Auth] Return URL provided:', returnUrl);
    }

    try {
        // 1. Create/update user in Firestore directly
        console.log('[Auth] Creating/updating user in Firestore...');
        await createOrUpdateFirestoreUser({
            uid: uid,
            email: email || 'no-email@example.com',
            displayName: displayName || 'User'
        });
        console.log('[Auth] User data saved to Firestore successfully.');

        // 2. Set up authenticated user session
        console.log('[Auth] Setting up authenticated user session...');
        await authService.setAuthenticatedUser({
            uid: uid,
            email: email,
            displayName: displayName,
            idToken: idToken
        });
        console.log('[Auth] User session established successfully.');

        // 3. Focus the app window and handle return URL
        const { windowPool } = require('./window/windowManager.js');
        const header = windowPool.get('header');
        if (header) {
            if (header.isMinimized()) header.restore();
            header.focus();
        }

        // 4. If there's a return URL, open it after authentication is complete
        if (returnUrl) {
            setTimeout(() => {
                console.log('[Auth] Opening return URL:', returnUrl);
                const timestamp = Date.now();
                const { getWebUrl } = require("./utils/webUrl");
                const urlWithTimestamp = `${getWebUrl()}${returnUrl}?t=${timestamp}`;
                require('electron').shell.openExternal(urlWithTimestamp);
            }, 1000);
        }
        
    } catch (error) {
        console.error('[Auth] Error during authentication:', error);
        const { windowPool } = require('./window/windowManager.js');
        const header = windowPool.get('header');
        if (header) {
            header.webContents.send('auth-failed', { message: error.message });
        }
    }
}

function handlePersonalizeFromUrl(params) {
    console.log('[Custom URL] Personalize params:', params);
    
    const { windowPool } = require('./window/windowManager.js');
    const header = windowPool.get('header');
    
    if (header) {
        if (header.isMinimized()) header.restore();
        header.focus();
        
        const { getWebUrl } = require("./utils/webUrl");
        const personalizeUrl = `${getWebUrl()}/settings`;
        console.log(`[Custom URL] Navigating to personalize page: ${personalizeUrl}`);
        header.webContents.loadURL(personalizeUrl);
        
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('enter-personalize-mode', {
                message: 'Personalization mode activated',
                params: params
            });
        });
    } else {
        console.error('[Custom URL] Header window not found for personalize');
    }
}


async function startWebStack() {
  console.log('NODE_ENV =', process.env.NODE_ENV); 
  const isDev = !app.isPackaged;

  const getAvailablePort = () => {
    return new Promise((resolve, reject) => {
      const server = require('net').createServer();
      server.listen(0, (err) => {
        if (err) reject(err);
        const port = server.address().port;
        server.close(() => resolve(port));
      });
    });
  };

  // Use a fixed API port for easier web integration, fall back to dynamic if needed
  let apiPort = 9001;
  const checkPort = (port) => {
    return new Promise((resolve) => {
      const server = require('net').createServer();
      server.listen(port, (err) => {
        server.close();
        resolve(!err);
      });
    });
  };
  
  const isPortAvailable = await checkPort(apiPort);
  if (!isPortAvailable) {
    console.log(`Port ${apiPort} not available, using dynamic port`);
    apiPort = await getAvailablePort();
  }
  
  const frontendPort = await getAvailablePort();

  console.log(`🔧 Allocated ports: API=${apiPort}, Frontend=${frontendPort}`);

  process.env.pickleglass_API_PORT = apiPort.toString();
  process.env.pickleglass_API_URL = `http://localhost:${apiPort}`;
  process.env.pickleglass_WEB_PORT = frontendPort.toString();

  console.log(`🌍 Environment variables set:`, {
    pickleglass_API_URL: process.env.pickleglass_API_URL,
    Hintsy_AI_URL: process.env.Hintsy_AI_URL || "http://localhost:3000"
  });

  // Make services available globally for the backend API
  global.pickleglassServices = {
    firestoreUsageService: require('./features/common/services/firestoreUsageService'),
    authService: require('./features/common/services/authService')
  };
  
  const createBackendApp = require('../pickleglass_web/backend_node');
  const nodeApi = createBackendApp(eventBridge);

  const staticDir = app.isPackaged
    ? path.join(process.resourcesPath, 'out')
    : path.join(__dirname, '..', 'pickleglass_web', 'out');

  const fs = require('fs');

  if (!fs.existsSync(staticDir)) {
    console.error(`============================================================`);
    console.error(`[ERROR] Frontend build directory not found!`);
    console.error(`Path: ${staticDir}`);
    console.error(`Please run 'npm run build' inside the 'pickleglass_web' directory first.`);
    console.error(`============================================================`);
    app.quit();
    return;
  }

  const runtimeConfig = {
    API_URL: `http://localhost:${apiPort}`,
    WEB_URL: `http://localhost:${frontendPort}`,
    timestamp: Date.now()
  };
  
  // 쓰기 가능한 임시 폴더에 런타임 설정 파일 생성
  const tempDir = app.getPath('temp');
  const configPath = path.join(tempDir, 'runtime-config.json');
  fs.writeFileSync(configPath, JSON.stringify(runtimeConfig, null, 2));
  console.log(`📝 Runtime config created in temp location: ${configPath}`);

  const frontSrv = express();
  
  // 프론트엔드에서 /runtime-config.json을 요청하면 임시 폴더의 파일을 제공
  frontSrv.get('/runtime-config.json', (req, res) => {
    res.sendFile(configPath);
  });

  frontSrv.use((req, res, next) => {
    if (req.path.indexOf('.') === -1 && req.path !== '/') {
      const htmlPath = path.join(staticDir, req.path + '.html');
      if (fs.existsSync(htmlPath)) {
        return res.sendFile(htmlPath);
      }
    }
    next();
  });
  
  frontSrv.use(express.static(staticDir));
  
  const frontendServer = await new Promise((resolve, reject) => {
    const server = frontSrv.listen(frontendPort, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
    app.once('before-quit', () => server.close());
  });

  console.log(`✅ Frontend server started on http://localhost:${frontendPort}`);

  const apiSrv = express();
  apiSrv.use(nodeApi);

  const apiServer = await new Promise((resolve, reject) => {
    const server = apiSrv.listen(apiPort, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
    app.once('before-quit', () => server.close());
  });

  console.log(`✅ API server started on http://localhost:${apiPort}`);

  console.log(`🚀 All services ready:
   Frontend: http://localhost:${frontendPort}
   API:      http://localhost:${apiPort}`);

  return frontendPort;
}

// Auto-update initialization
async function initAutoUpdater() {
    if (process.env.NODE_ENV === 'development') {
        console.log('Development environment, skipping auto-updater.');
        return;
    }

    try {
        // Lazy load autoUpdater
        if (!autoUpdater) {
            const { autoUpdater: updater } = require('electron-updater');
            autoUpdater = updater;
        }
        
        await autoUpdater.checkForUpdates();
        autoUpdater.on('update-available', () => {
            console.log('Update available!');
            autoUpdater.downloadUpdate();
        });
        autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName, date, url) => {
            console.log('Update downloaded:', releaseNotes, releaseName, date, url);
            dialog.showMessageBox({
                type: 'info',
                title: 'Application Update',
                message: `A new version of PickleGlass (${releaseName}) has been downloaded. It will be installed the next time you launch the application.`,
                buttons: ['Restart', 'Later']
            }).then(response => {
                if (response.response === 0) {
                    autoUpdater.quitAndInstall();
                }
            });
        });
        autoUpdater.on('error', (err) => {
            console.error('Error in auto-updater:', err);
        });
    } catch (err) {
        console.error('Error initializing auto-updater:', err);
    }
}