# Environment Variable Migration: pickleglass_WEB_URL → Hintsy_AI_URL

## 🔄 What Changed

The environment variable name has been updated to better reflect the HintsyAI branding:

**Old:** `pickleglass_WEB_URL`  
**New:** `Hintsy_AI_URL`

## 📁 Files Updated

### Core Configuration
- ✅ `src/utils/webUrl.js` - Utility function
- ✅ `src/features/common/config/config.js` - Main config
- ✅ `src/bridge/featureBridge.js` - IPC bridge

### Service Files  
- ✅ `src/features/common/services/usageTrackingService.js`
- ✅ `src/features/common/services/authService.js`
- ✅ `src/window/windowManager.js`
- ✅ `src/index.js` - Main entry point

### Web Backend
- ✅ `pickleglass_web/backend_node/index.js`
- ✅ `pickleglass_web/app/api/create-checkout-session/route.ts`

### Documentation
- ✅ `.env.example`
- ✅ `DEPLOYMENT_GUIDE.md`

## �� How to Use

### Development (Default)
```bash
# No change needed - still works with localhost
npm start
```

### Production Deployment
```bash
# NEW environment variable name
export Hintsy_AI_URL="https://your-deployment-domain.com"
npm start
```

### Using .env File
```bash
# Create .env file with new variable name
echo "Hintsy_AI_URL=https://your-domain.com" > .env
npm start
```

## ⚠️ Migration Required

If you were previously using `pickleglass_WEB_URL`, you need to update your environment configuration:

### Before
```bash
export pickleglass_WEB_URL="https://hintsy.ai"
```

### After  
```bash
export Hintsy_AI_URL="https://hintsy.ai"
```

## 🔍 Verification

Check that the new variable is working:
```bash
echo $Hintsy_AI_URL
```

Look for this in console logs:
```
[Config] Web URL from env: https://your-domain.com
🌍 Environment variables set: { Hintsy_AI_URL: 'https://your-domain.com' }
```

## 🎯 What Uses This Variable

All the following now use `Hintsy_AI_URL`:
- Authentication redirects
- Billing page links
- Stripe checkout success/cancel URLs  
- Usage tracking upgrade prompts
- Settings page navigation
- Deep linking handlers
- IPC web URL requests

## ✅ Backward Compatibility

- Still falls back to `http://localhost:3000` if not set
- All functionality remains exactly the same
- Only the environment variable name changed
