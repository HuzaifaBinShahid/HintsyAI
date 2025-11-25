/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Ensure we're not using static export for API routes
  // output: 'export', // COMMENTED OUT to enable serverless functions
  images: { 
    unoptimized: true,
    domains: [],
  },
  experimental: {
    serverComponentsExternalPackages: ['stripe'],
  },
  // Ensure proper handling of API routes
  async rewrites() {
    return []
  },
  // Configure security headers conditionally - disabled for now to fix Firebase auth
  async headers() {
    // Temporarily disable COOP headers to fix Firebase authentication issues
    return []
    
    // Only apply COOP headers in production to avoid blocking dev authentication
    if (process.env.NODE_ENV !== 'production') {
      return []
    }

    return [
      {
        // Apply to all routes in production only
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
      {
        // Special handling for login page to allow protocol redirects in production
        source: '/login',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'unsafe-none',
          },
        ],
      },
    ]
  },
  // Handle environment variables properly
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  },
}

module.exports = nextConfig 