import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.geoapify.com https://api.geoapify.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob: https:",
  "upgrade-insecure-requests",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: process.env.NODE_ENV === 'development'
      ? { allowedOrigins: ['*.app.github.dev', 'localhost:3000'] }
      : undefined,
  },
  images: {
    // OpenNext/Cloudflare serves local application assets directly.
    unoptimized: true,
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      ],
    }]
  },
}

export default nextConfig

if (process.env.NODE_ENV === 'development') initOpenNextCloudflareForDev()
