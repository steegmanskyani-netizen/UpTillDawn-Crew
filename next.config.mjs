/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['*.app.github.dev', 'localhost:3000'],
    },
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['pdfkit'],
}

export default nextConfig
