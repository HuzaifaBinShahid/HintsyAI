@echo off
echo 🚀 Starting Hintsy AI Development Environment

echo 📦 Starting Next.js development server...
cd pickleglass_web
start /B npm run dev
cd ..

echo ⏳ Waiting for web server to be available...
npx wait-on http://localhost:3000 --timeout 30000

if %errorlevel% equ 0 (
    echo ✅ Web server is running on http://localhost:3000
    echo 🖥️  Starting Electron app...
    npm run build:renderer && electron .
) else (
    echo ❌ Web server failed to start within 30 seconds
    exit /b 1
)
