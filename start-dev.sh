#!/bin/bash

echo "🚀 Starting Hintsy AI Development Environment"

# Function to cleanup background processes
cleanup() {
    echo "🧹 Cleaning up..."
    kill $WEB_PID 2>/dev/null
    exit 0
}

# Set up cleanup trap
trap cleanup SIGINT SIGTERM

# Start the Next.js development server
echo "📦 Starting Next.js development server..."
cd pickleglass_web
npm run dev &
WEB_PID=$!
cd ..

# Wait for the web server to start
echo "⏳ Waiting for web server to be available..."
npx wait-on http://localhost:3000 --timeout 30000

if [ $? -eq 0 ]; then
    echo "✅ Web server is running on http://localhost:3000"
    echo "🖥️  Starting Electron app..."
    npm run build:renderer && electron .
else
    echo "❌ Web server failed to start within 30 seconds"
    cleanup
fi
