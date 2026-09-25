# Uptilldawn deployment

## Production

- Internal Cloudflare Worker: `uptilldawn-crew` (no public `workers.dev` route)
- Public Cloudflare Worker alias: `crew`
- Primary production origin: `https://crew.uptilldawn.workers.dev`
- Deployment source: GitHub `main`
- Runtime: Next.js 16 through OpenNext on Cloudflare Workers
- Supabase project: `eakoavcieossazqzplke`

Production is deployed by the Cloudflare Workers Builds trigger `Production main` connected to GitHub `main`. It runs lint, TypeScript checks, tests and the OpenNext build before deploying with Wrangler. The separate GitHub production workflow remains manual. God Mode source proposals create branches and pull requests, require a successful CI run, and merge to main to start the production build.

## Runtime variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Production Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe publishable key |
| `NEXT_PUBLIC_APP_URL` | Exact production HTTPS origin (`https://crew.uptilldawn.workers.dev`) |
| `GEOAPIFY_API_KEY` | Server-only event address/geocoding key |

The Cloudflare Worker must never receive a Supabase service-role key in a public variable.

## Web Push architecture

Web Push delivery is intentionally separated from the Cloudflare app runtime:

1. Browser/PWA obtains permission and stores a Push API subscription through authenticated app routes.
2. Subscription details are stored in `public.push_subscriptions` through scoped RPCs; direct browser table access is not used.
3. A new `crew_notifications` row triggers an asynchronous `pg_net` POST.
4. Supabase Edge Function `push-notification` loads the target notification/subscriptions using the built-in server-side service role and sends Web Push.
5. VAPID private key and webhook secret remain in private server-side configuration, never GitHub or frontend code.
6. Push endpoints must use HTTPS; localhost/private/link-local literal targets are rejected in the app/Edge path.
7. Notification-click destinations are restricted to local app paths.

## PWA update behavior

`public/sw.js` handles offline fallbacks, push, notification clicks, subscription renewal and optional Periodic Background Sync. The client also requests service-worker updates on launch/focus/visibility/online transitions so installed apps do not depend solely on background scheduling support.

## Release checks

```sh
npm ci
npm audit --audit-level=high
npm run lint
npm run typecheck
npm test
npm run build
npm run build:cloudflare
npx wrangler deploy --dry-run
```

After deployment, verify the public login/auth surface, manifest, service worker, public `crew` alias and internal production Worker version. Authenticated role/device E2E remains a real-device regression activity.

## Database

Production has 121 migration-history entries matching 121 migration files in the repository at this baseline. Do not reset production or replay the chain there. Use an isolated project for from-zero migration verification.

## God Mode source studio

See [GOD_MODE_STUDIO.md](GOD_MODE_STUDIO.md) for code editing, data administration, SQL and the one-time website-owned GitHub/Supabase connections.
