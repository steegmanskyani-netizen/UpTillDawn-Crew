/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: process.env.NODE_ENV === 'development'
      ? { allowedOrigins: ['*.app.github.dev', 'localhost:3000'] }
      : undefined,
  },
  images: {
    // OpenNext/Cloudflare serves the local auth/logo assets directly.
    unoptimized: true,
  },
}

export default nextConfig
