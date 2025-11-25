const { screen } = require('electron');
const os = require('os');

class MeetingDetectionService {
    constructor() {
        this.isMonitoring = false;
        this.currentActiveWindow = null;
        this.meetingApps = new Set([
            'Google Meet',
            'meet.google.com',
            'Zoom',
            'zoom.us',
            'Microsoft Teams',
            'Teams',
            'Discord',
            'discord.com',
            'Slack',
            'slack.com',
        ]);

        this.meetingKeywords = [
            'meet.google.com',
            'zoom.us',
            'teams.microsoft.com',
            'discord.com',
            'slack.com',
        ];

        this.lastDetectionTime = 0;
        this.detectionCooldown = 5000; // 5 seconds cooldown
        this.monitoringInterval = null;
        this.errorCount = 0;
        this.maxErrors = 5;
    }

    startMonitoring() {
        if (this.isMonitoring) return;

        this.isMonitoring = true;
        this.errorCount = 0;
        this.monitorActiveWindow();

        console.log('[MeetingDetection] Started monitoring for meeting applications');
    }

    stopMonitoring() {
        this.isMonitoring = false;

        if (this.monitoringInterval) {
            clearTimeout(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        console.log('[MeetingDetection] Stopped monitoring');
    }

    async monitorActiveWindow() {
        if (!this.isMonitoring) return;

        try {
            const activeWindow = await this.getActiveWindowInfo();

            if (activeWindow && this.isMeetingApp(activeWindow)) {
                this.handleMeetingAppDetected(activeWindow);
            }

            // Reset error count on successful monitoring
            this.errorCount = 0;

            // Continue monitoring
            this.monitoringInterval = setTimeout(() => this.monitorActiveWindow(), 1000);
        } catch (error) {
            console.error('[MeetingDetection] Error monitoring active window:', error);
            this.errorCount++;

            // If too many errors, stop monitoring to prevent spam
            if (this.errorCount >= this.maxErrors) {
                console.error('[MeetingDetection] Too many errors, stopping monitoring');
                this.stopMonitoring();
                return;
            }

            // Continue monitoring with longer delay on errors
            this.monitoringInterval = setTimeout(() => this.monitorActiveWindow(), 2000);
        }
    }

    async getActiveWindowInfo() {
        try {
            // Get primary display
            const primaryDisplay = screen.getPrimaryDisplay();

            // For now, we'll use a cross-platform approach
            // In a real implementation, you might want to use platform-specific APIs
            if (process.platform === 'win32') {
                return await this.getWindowsActiveWindow();
            } else if (process.platform === 'darwin') {
                return await this.getMacActiveWindow();
            } else {
                return await this.getLinuxActiveWindow();
            }
        } catch (error) {
            console.error('[MeetingDetection] Error getting active window info:', error);
            return null;
        }
    }

    async getWindowsActiveWindow() {
        try {
            // Use PowerShell to get active window info
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);

            const command = `
                Add-Type -TypeDefinition @"
                using System;
                using System.Runtime.InteropServices;
                public class Win32 {
                    [DllImport("user32.dll")]
                    public static extern IntPtr GetForegroundWindow();
                    
                    [DllImport("user32.dll")]
                    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
                    
                    [DllImport("user32.dll")]
                    public static extern int GetWindowTextLength(IntPtr hWnd);
                    
                    [DllImport("user32.dll")]
                    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
                    
                    [DllImport("kernel32.dll")]
                    public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);
                    
                    [DllImport("kernel32.dll")]
                    public static extern bool QueryFullProcessImageName(IntPtr hprocess, uint dwFlags, System.Text.StringBuilder lpExeName, ref uint lpdwSize);
                }
"@
                
                $hwnd = [Win32]::GetForegroundWindow()
                $length = [Win32]::GetWindowTextLength($hwnd)
                $text = New-Object System.Text.StringBuilder($length + 1)
                [Win32]::GetWindowText($hwnd, $text, $text.Capacity)
                
                $processId = 0
                [Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId)
                
                $process = [Win32]::OpenProcess(0x1000, $false, $processId)
                $exeName = New-Object System.Text.StringBuilder(260)
                $size = 260
                [Win32]::QueryFullProcessImageName($process, 0, $exeName, [ref]$size)
                
                $windowTitle = $text.ToString()
                $processName = [System.IO.Path]::GetFileNameWithoutExtension($exeName.ToString())
                
                Write-Output "Title:$windowTitle|Process:$processName"
            `;

            const { stdout } = await execAsync(command, { shell: 'powershell.exe' });
            const output = stdout.trim();

            if (output && output.includes('|')) {
                const [titlePart, processPart] = output.split('|');
                const title = titlePart.replace('Title:', '');
                const process = processPart.replace('Process:', '');

                return {
                    title: title,
                    process: process,
                    platform: 'win32'
                };
            }

            return null;
        } catch (error) {
            console.error('[MeetingDetection] Error getting Windows active window:', error);
            // Fallback to basic process detection
            return await this.getWindowsFallback();
        }
    }

    async getWindowsFallback() {
        try {
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);

            // Simple fallback using tasklist
            const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV', { shell: 'cmd.exe' });

            if (stdout.includes('chrome.exe')) {
                return {
                    title: 'Chrome Browser',
                    process: 'chrome',
                    platform: 'win32'
                };
            }

            return null;
        } catch (error) {
            console.error('[MeetingDetection] Fallback Windows detection failed:', error);
            return null;
        }
    }

    async getMacActiveWindow() {
        try {
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);

            // More robust AppleScript that handles cases where windows might not exist
            const command = `
                osascript -e '
                    try
                        tell application "System Events"
                            set frontApp to name of first application process whose frontmost is true
                        end tell
                        set frontApp to frontApp as string
                        
                        try
                            tell application "System Events"
                                set frontWindow to name of first window of process frontApp
                            end tell
                            set frontWindow to frontWindow as string
                        on error
                            set frontWindow to "Unknown Window"
                        end try
                        
                        return frontApp & "|" & frontWindow
                    on error
                        return "Unknown App|Unknown Window"
                    end try
                '
            `;

            const { stdout } = await execAsync(command);
            const output = stdout.trim();

            if (output && output.includes('|')) {
                const [process, title] = output.split('|');

                return {
                    title: title,
                    process: process,
                    platform: 'darwin'
                };
            }

            return null;
        } catch (error) {
            // Log error but don't crash - this is a non-critical feature
            console.warn('[MeetingDetection] Warning: Could not get Mac active window:', error.message);
            return null;
        }
    }

    async getLinuxActiveWindow() {
        try {
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);

            // Try different methods for Linux
            let command = '';

            // Try xdotool first
            try {
                await execAsync('which xdotool');
                command = 'xdotool getactivewindow getwindowname';
            } catch {
                // Try wmctrl
                try {
                    await execAsync('which wmctrl');
                    command = 'wmctrl -l | grep "$(xprop -root _NET_ACTIVE_WINDOW | cut -d " " -f 5 | xargs printf "0x%08x")" | cut -d " " -f 4-';
                } catch {
                    // Fallback to basic process info
                    command = 'ps -p $(xdotool getactivewindow getwindowpid) -o comm=';
                }
            }

            const { stdout } = await execAsync(command);
            const output = stdout.trim();

            if (output) {
                return {
                    title: output,
                    process: output,
                    platform: 'linux'
                };
            }

            return null;
        } catch (error) {
            console.error('[MeetingDetection] Error getting Linux active window:', error);
            return null;
        }
    }

    isMeetingApp(windowInfo) {
        if (!windowInfo || !windowInfo.title) return false;

        const title = windowInfo.title.toLowerCase();
        const process = (windowInfo.process || '').toLowerCase();

        // Check if current time allows detection (cooldown)
        const now = Date.now();
        if (now - this.lastDetectionTime < this.detectionCooldown) {
            return false;
        }

        // Check for meeting app process names
        for (const app of this.meetingApps) {
            if (process.includes(app.toLowerCase()) || title.includes(app.toLowerCase())) {
                return true;
            }
        }

        // Check for meeting keywords in window title
        for (const keyword of this.meetingKeywords) {
            if (title.includes(keyword.toLowerCase())) {
                return true;
            }
        }

        // Check for specific meeting URL patterns
        const urlPatterns = [
            /meet\.google\.com/i,
            /zoom\.us/i,
            /teams\.microsoft\.com/i,
            /discord\.com/i,
            /skype\.com/i,
            /slack\.com/i,
            /webex\.com/i,
            /bluejeans\.com/i,
            /gotomeeting\.com/i,
            /jitsi\.org/i,
            /whereby\.com/i,
            /bigbluebutton\.org/i
        ];

        for (const pattern of urlPatterns) {
            if (pattern.test(title)) {
                return true;
            }
        }

        return false;
    }

    handleMeetingAppDetected(windowInfo) {
        this.lastDetectionTime = Date.now();
        this.currentActiveWindow = windowInfo;

        // Emit event for other parts of the application
        if (global.eventBridge) {
            const eventData = {
                meetingInfo: windowInfo,  // Rename to match what MainHeader expects
                timestamp: Date.now(),
                suggestion: this.getMeetingSuggestion(windowInfo)
            };
            
            global.eventBridge.emit('meeting:detected', eventData);
        }
    }

    getMeetingSuggestion(windowInfo) {
        const suggestions = [
            "🎯 Use Hintsy to capture meeting notes and action items in real-time!",
            "💡 Let Hintsy transcribe and summarize your meeting automatically",
            "🚀 Get AI-powered insights and follow-ups from your meeting",
            "📝 Hintsy can help you focus on the conversation while it takes notes",
            "🎤 Start listening to capture key points and decisions",
            "🤖 AI meeting assistant ready to help - just click Listen!"
        ];

        // Return a random suggestion
        return suggestions[Math.floor(Math.random() * suggestions.length)];
    }

    getCurrentMeetingInfo() {
        return this.currentActiveWindow;
    }

    isCurrentlyInMeeting() {
        return this.currentActiveWindow !== null;
    }

    // Method to manually trigger meeting detection for testing
    async testMeetingDetection() {

        try {
            const activeWindow = await this.getActiveWindowInfo();

            if (activeWindow) {
                const isMeeting = this.isMeetingApp(activeWindow);

                if (isMeeting) {
                    this.handleMeetingAppDetected(activeWindow);
                }

                return { activeWindow, isMeeting };
            }

            return { activeWindow: null, isMeeting: false };
        } catch (error) {
            console.error('[MeetingDetection] Test failed:', error);
            return { error: error.message };
        }
    }
}

module.exports = new MeetingDetectionService(); 