# Uptilldawn build status

The current `main` branch is the canonical production baseline.

Required release checks:

- dependency audit
- ESLint
- TypeScript
- Node regression tests
- Next.js production build
- OpenNext Cloudflare build
- Wrangler deployment dry-run
- production Cloudflare Git build/deploy
- Supabase SQL regression suite

The desktop/web layout, contextual mobile navigation, role UI defaults, installed-PWA behavior and Web Push flow are part of this baseline and are covered by regression tests.

See [UPTILLDAWN_IMPLEMENTATION_STATUS.md](UPTILLDAWN_IMPLEMENTATION_STATUS.md) for the latest verified state and [DEPLOYMENT.md](DEPLOYMENT.md) for runtime architecture.
