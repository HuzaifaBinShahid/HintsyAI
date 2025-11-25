# System Audio Capture (macOS)

## Issue
The `SystemAudioDump` binary is missing from the project, which causes the listen functionality to fail with an `ENOENT` error when trying to capture system audio on macOS.

## Current Status
✅ **Fixed**: The app now gracefully handles the missing binary and continues with microphone-only capture.

## What SystemAudioDump Does
- Captures system audio output (speakers/headphones) on macOS
- Provides raw PCM audio data for speech-to-text processing
- Enables the app to transcribe what others are saying in video calls, meetings, etc.

## Current Behavior (After Fix)
1. App attempts to start SystemAudioDump
2. If binary is missing, logs a warning and continues
3. Listen functionality works with **microphone-only** capture
4. No app crashes or uncaught exceptions

## To Restore Full System Audio Capture

### Option 1: Obtain the Binary
If you have the `SystemAudioDump` binary:
1. Place it in: `src/ui/assets/SystemAudioDump`
2. Make it executable: `chmod +x src/ui/assets/SystemAudioDump`
3. Uncomment the line in `electron-builder.yml`:
   ```yaml
   asarUnpack:
       - "src/ui/assets/SystemAudioDump"
   ```

### Option 2: Build from Source
If you have the source code for SystemAudioDump:
1. Compile it for macOS (both Intel and Apple Silicon if targeting universal builds)
2. Follow Option 1 steps above

### Option 3: Alternative Implementation
Consider using macOS's built-in audio APIs:
- Core Audio framework
- Audio Unit framework
- AVAudioEngine

## Console Output
When SystemAudioDump is missing, you'll see:
```
SystemAudioDump binary not found at: /path/to/SystemAudioDump
System audio capture will be disabled. App will continue with microphone-only capture.
To enable system audio capture, please ensure SystemAudioDump binary is available.
```

## Impact
- ✅ App no longer crashes when clicking "Listen"
- ✅ Microphone capture still works
- ❌ System audio (speakers/calls) not captured
- ⚠️ Reduced functionality for meeting/call transcription

## Files Modified
- `src/features/listen/stt/sttService.js` - Added graceful error handling
- `src/features/listen/listenService.js` - Updated success response handling  
- `electron-builder.yml` - Commented out SystemAudioDump packing