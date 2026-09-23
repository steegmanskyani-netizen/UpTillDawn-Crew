# Uptilldawn deployment

## Architecture

The existing Next.js application uses SSR, Server Actions, authenticated cookies and an Excel route handler. Use Cloudflare **Workers with OpenNext**, not a static Pages export. The requested `uptilldawn-crew.pages.dev` URL is not a verified deployment and is not the default hostname for Workers.

Cloudflare now recommends vinext for new applications. OpenNext is used here to retain the actual existing Next.js build/runtime rather than introducing a framework implementation change during security repairs.

References:
- https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- https://opennext.js.org/cloudflare/get-started

## Runtime variables

Use `.env.example` as the authoritative template:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL of the existing Uptilldawn Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Active publishable key; variable name retained for compatibility |
| `NEXT_PUBLIC_APP_URL` | Exact production HTTPS origin for auth email redirects |

The active crew application does not require a service-role key. Never use a service-role/secret key in a `NEXT_PUBLIC_` variable. Build with the correct production values: public Next.js variables are embedded into the bundle. Configure the same values for the Worker runtime where applicable.

Set Supabase Auth's Site URL and allowed redirects to the final production origin and `/auth/callback`. Local testing uses `http://localhost:3000`. Do not ship a bundle built with localhost as the production app origin.

## Commands

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build:cloudflare
npx wrangler deploy --dry-run
```

After release blockers in `UPTILLDAWN_IMPLEMENTATION_STATUS.md` have been resolved, authenticate Cloudflare, configure the production variables and rebuild before deploying:

```sh
npx wrangler login
npm run build:cloudflare
npm run deploy:cloudflare
```

No paid resources or paid plan were enabled. The build dry-run reported a compressed Worker size below 3 MiB; actual account limits, CPU usage and operational load still require verification. No R2, D1 or KV binding is required by this configuration.

## GitHub production workflow

A guarded manual workflow is available at `.github/workflows/deploy-cloudflare.yml`. It only deploys from `main`, uses the GitHub `production` environment and refuses to continue when required secrets are missing.

Configure these GitHub production-environment secrets before triggering it:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` — exact HTTPS production origin
- `CLOUDFLARE_API_TOKEN` — scoped to the Worker deployment
- `CLOUDFLARE_ACCOUNT_ID`

The workflow runs lint, typecheck, tests, the OpenNext Cloudflare build and a Wrangler dry-run before the actual deployment. Do not place the Supabase service-role key in GitHub frontend/deployment variables; the active crew app does not require it.

## Database

Project ref: `eakoavcieossazqzplke`. Migrations introduced here are already applied there. Do not reapply them blindly or run a reset. Migration filenames are aligned to the versions returned by Supabase's migration history.

The SQL regression file must be executed as a complete transaction. It creates synthetic users/data and ends with `ROLLBACK`. Do not split it into separately committed statements. Never use production accounts as mutable fixtures.

Server warnings use the `uptilldawn-break-allowance` pg_cron job, once per minute. Its internal function and receipt table are in a private schema without browser access. This creates in-app notifications; it does not send Web Push.

## Release gates

Verify approved and unapproved login for all three roles, workload isolation, fresh camera capture, GPS denial and poor accuracy, self-approval denial, work/break cycles, pending offline operations/replay, chat isolation, XLSX output and audit entries. Exercise the real deployed Worker runtime, not only `next dev`.

Deployment was not attempted because Wrangler reported no authenticated Cloudflare account and the feature-completion gates remain open. No production URL or production smoke-test success is claimed.
