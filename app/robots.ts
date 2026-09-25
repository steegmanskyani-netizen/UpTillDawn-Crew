import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/login', '/signup', '/forgot-password', '/verify-email'],
        disallow: [
          '/api/',
          '/admin',
          '/audit',
          '/auth/',
          '/briefings',
          '/chat',
          '/crew',
          '/events',
          '/exports',
          '/incidents',
          '/notifications',
          '/operations',
          '/personnel',
          '/settings',
          '/shifts',
          '/sync',
          '/tasks',
          '/workplaces',
        ],
      },
    ],
    sitemap: 'https://crew-uptilldawn.be/sitemap.xml',
    host: 'https://crew-uptilldawn.be',
  }
}
