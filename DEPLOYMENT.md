# Uptilldawn deployment

## Production

- Cloudflare Worker: `uptilldawn-crew`
- Production origin: `https://uptilldawn-crew.steegmans-kyani.workers.dev`
- Deployment source: GitHub `main`
- Runtime: Next.js 16 through OpenNext on Cloudflare Workers
- Supabase project: `eakoavcieossazqzplke`

The Git-connected Cloudflare build is the production deployment path. CI separately validates the same application with lint, TypeScript, tests, OpenNext build and Wrangler dry-run.

## Runtime variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Production Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe publishable key |
| `NEXT_PUBLIC_APP_URL` | Exact production HTTPS origin |
| `GEOAPIFY_API_KEY` | Server-only event address/geocoding key |

The Cloudflare Worker must never receive a Supabase service-role key in a public variable.

## Web Push architecture

Web Push delivery is intentionally separated from the Cloudflare app runtime:

1. Browser/PWA obtains permission and stores a Push API subscription through authenticated app routes.
2. Subscription details are stored in `public.push_subscriptions` through scoped RPCs; direct browser table access is not used.
3. A new `crew_notifications` row triggers an asynchronous `pg_net` POST.
4. Supabase Edge Function `push-notification` loads the target notification/subscriptions using the built-in server-side service role and sends Web Push.
5. VAPID private key and webhook secret remain in private server-side configuration, never GitHub or frontend code.

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

After deployment, verify the public login/auth surface, manifest, service worker and production Worker version. Authenticated role/device E2E remains a real-device regression activity.

## Database

Production has 105 migration-history entries matching 105 migration files in the repository at this baseline. Do not reset production or replay the chain there. Use an isolated project for from-zero migration verification.
