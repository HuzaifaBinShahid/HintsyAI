# HintsyAI Deployment Configuration Guide

## 🚀 Dynamic URL Configuration

The app now uses **dynamic URLs** instead of hardcoded `localhost:3000`. This allows you to deploy to any domain.

## 📝 Environment Variables

### Required Environment Variables

Set these environment variables before running the app:

```bash
# Your deployed web application URL
export Hintsy_AI_URL="https://your-deployment-domain.com"

# Your API server URL (if separate)
export pickleglass_API_URL="https://your-api-domain.com"
```

### Example Configurations

#### Development (Default)
```bash
Hintsy_AI_URL="http://localhost:3000"
pickleglass_API_URL="http://localhost:9001"
```

#### Production Deployment
```bash
Hintsy_AI_URL="https://hintsy.ai"
pickleglass_API_URL="https://api.hintsy.ai"
```

#### Staging Environment
```bash
Hintsy_AI_URL="https://staging.hintsy.ai"
pickleglass_API_URL="https://staging-api.hintsy.ai"
```

## 🔧 How to Set Environment Variables

### Option 1: Create .env file
```bash
# Create .env file in the project root
cp .env.example .env

# Edit the .env file with your URLs
nano .env
```

### Option 2: Export in terminal
```bash
export Hintsy_AI_URL="https://your-domain.com"
npm start
```

### Option 3: Set in package.json scripts
```json
{
  "scripts": {
    "start:prod": "Hintsy_AI_URL=https://hintsy.ai npm start"
  }
}
```

## 🎯 What URLs Are Now Dynamic

The following URLs now automatically use your configured domain:

✅ **Authentication redirects** - Login/logout flows
✅ **Billing page redirects** - Stripe checkout success/cancel URLs  
✅ **Settings page links** - Links to billing and settings
✅ **Usage tracking notifications** - Upgrade prompts and links
✅ **Deep linking** - Custom URL scheme handlers
✅ **IPC communication** - Web URL requests from Electron

## 🔍 Verification

To verify the configuration is working:

1. **Check console logs** - Look for:
   ```
   [Config] Web URL from env: https://your-domain.com
   🌍 Environment variables set: { Hintsy_AI_URL: 'https://your-domain.com' }
   ```

2. **Test authentication** - Login should redirect to your domain
3. **Test billing** - Stripe checkout should return to your domain
4. **Check network requests** - All API calls should use your configured URLs

## 🚨 Important Notes

- **No more hardcoded URLs** - All `localhost:3000` references are now dynamic
- **Backward compatible** - Still works with localhost for development
- **Environment first** - Always checks environment variables first
- **Fallback safe** - Falls back to localhost if no env var is set

## 🐛 Troubleshooting

### URLs still showing localhost
- Make sure environment variables are set **before** starting the app
- Check that variable names are exact: `Hintsy_AI_URL` (not `WEB_URL`)
- Restart the app after setting environment variables

### Authentication not working
- Verify your deployment URL is accessible
- Check that CORS is configured for your domain
- Ensure SSL certificates are valid for HTTPS URLs

### Stripe checkout issues
- Confirm your domain is added to Stripe's allowed redirect URLs
- Test both success and cancel URL redirects
- Check Stripe webhook endpoints if using webhooks

## 📞 Support

If you need help with deployment configuration:
- Check the console logs for configuration details
- Verify environment variables with `echo $Hintsy_AI_URL`
- Test with a simple localhost setup first, then switch to production URLs
