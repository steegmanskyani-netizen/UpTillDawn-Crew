import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

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
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      ],
    }]
  },
}

export default nextConfig

if (process.env.NODE_ENV === 'development') initOpenNextCloudflareForDev()
