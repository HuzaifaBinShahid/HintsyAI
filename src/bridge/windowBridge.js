// src/bridge/windowBridge.js
const { ipcMain, shell } = require('electron');

// Bridge는 단순히 IPC 핸들러를 등록하는 역할만 함 (비즈니스 로직 없음)
module.exports = {
  initialize() {
    // initialize 시점에 windowManager를 require하여 circular dependency 문제 해결
    const windowManager = require('../window/windowManager');
    
    // Bridge eventBridge events to MainHeader
    if (global.eventBridge) {
      global.eventBridge.on('meeting:detected', (data) => {
        // Send meeting detection event to all header windows
        const headerWindow = windowManager.getHeaderWindow();
        if (headerWindow && !headerWindow.isDestroyed()) {
          headerWindow.webContents.send('meeting:detected', data);
        } else {
          console.warn('[WindowBridge] Header window not available for meeting detection');
        }
      });
    } else {
      console.warn('[WindowBridge] global.eventBridge not available');
    }
    
    // 기존 IPC 핸들러들
    ipcMain.handle('toggle-content-protection', () => windowManager.toggleContentProtection());
    ipcMain.handle('resize-header-window', (event, args) => windowManager.resizeHeaderWindow(args));
    ipcMain.handle('get-content-protection-status', () => windowManager.getContentProtectionStatus());
    ipcMain.on('show-settings-window', () => windowManager.showSettingsWindow());
    ipcMain.on('hide-settings-window', () => windowManager.hideSettingsWindow());
    ipcMain.on('cancel-hide-settings-window', () => windowManager.cancelHideSettingsWindow());

    ipcMain.handle('open-login-page', () => windowManager.openLoginPage());
    ipcMain.handle('open-personalize-page', () => windowManager.openLoginPage());
    ipcMain.handle('move-window-step', (event, direction) => windowManager.moveWindowStep(direction));
    ipcMain.handle('open-external', (event, url) => {
        console.log('[WindowBridge] Opening external URL:', url);
        return shell.openExternal(url);
    });

    ipcMain.handle('show-usage-limit-modal', (event, modalData) => {
        console.log('[WindowBridge] Showing usage limit modal:', modalData);
        return windowManager.showUsageLimitModal(modalData);
    });

    ipcMain.handle('hide-usage-limit-modal', (event) => {
        console.log('[WindowBridge] Hiding usage limit modal');
        return windowManager.hideUsageLimitModal();
    });

    // Newly moved handlers from windowManager
    ipcMain.on('header-state-changed', (event, state) => windowManager.handleHeaderStateChanged(state));
    ipcMain.on('header-animation-finished', (event, state) => windowManager.handleHeaderAnimationFinished(state));
    ipcMain.handle('get-header-position', () => windowManager.getHeaderPosition());
    ipcMain.handle('move-header-to', (event, newX, newY) => windowManager.moveHeaderTo(newX, newY));
    ipcMain.handle('adjust-window-height', (event, { winName, height }) => windowManager.adjustWindowHeight(winName, height));
    
    // Meeting Detection IPC handlers for MainHeader
    ipcMain.handle('mainHeader:start-meeting-monitoring', async () => {
        const meetingDetectionService = require('../features/common/services/meetingDetectionService');
        meetingDetectionService.startMonitoring();
        return { success: true };
    });
    
    ipcMain.handle('mainHeader:stop-meeting-monitoring', async () => {
        const meetingDetectionService = require('../features/common/services/meetingDetectionService');
        meetingDetectionService.stopMonitoring();
        return { success: true };
    });
    
    ipcMain.handle('mainHeader:get-meeting-info', async () => {
        const meetingDetectionService = require('../features/common/services/meetingDetectionService');
        return meetingDetectionService.getCurrentMeetingInfo();
    });
    
    ipcMain.handle('mainHeader:is-in-meeting', async () => {
        const meetingDetectionService = require('../features/common/services/meetingDetectionService');
        return meetingDetectionService.isCurrentlyInMeeting();
    });
    
    ipcMain.handle('mainHeader:auto-show', async () => {
        const meetingDetectionService = require('../features/common/services/meetingDetectionService');
        const meetingInfo = meetingDetectionService.getCurrentMeetingInfo();
        if (meetingInfo) {
            // Auto-show the header when meeting is detected
            windowManager.autoShowHeaderForMeeting(meetingInfo);
            return { success: true, meetingInfo };
        }
        return { success: false, message: 'No meeting detected' };
    });
    
    ipcMain.handle('mainHeader:ensure-visible', async () => {
        return windowManager.ensureHeaderVisible();
    });
  },

  notifyFocusChange(win, isFocused) {
    win.webContents.send('window:focus-change', isFocused);
  }
};