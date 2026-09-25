import type { MetadataRoute } from 'next'

const ORIGIN = 'https://crew-uptilldawn.be'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${ORIGIN}/login`,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${ORIGIN}/signup`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ]
}
