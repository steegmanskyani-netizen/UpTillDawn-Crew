# Uptilldawn Crew Management

Operational crew-management PWA for Uptilldawn events. The active application is a Next.js 16 / React 19 app backed by Supabase Auth, PostgreSQL, Row Level Security, private Storage and Realtime. Cloudflare Workers with OpenNext is the deployment target.

## What the app covers

- Staff, Responsible Lead and Admin login portals
- Admin approval before an account can use the crew app
- Events, workplaces, shifts and Responsible assignments
- Check-in / check-out approval
- Server-authoritative work and break tracking
- 60-minute shared break allowance per employee/event
- Workplace transitions without double-counting time
- General and personal briefings with version acknowledgements
- Tasks and task assignments
- General, event, workplace and private chat
- URGENT incidents with optional photo and GPS evidence
- Private profile/check-in/chat/incident media
- Admin Excel export and audit trail
- IndexedDB operation/upload queues plus an offline operational shell

## Status

See [UPTILLDAWN_IMPLEMENTATION_STATUS.md](UPTILLDAWN_IMPLEMENTATION_STATUS.md) for the verified implementation status and remaining release gates.

The current hardening branch is not a production deployment. Do not treat the requested `pages.dev` hostname as live until a real Cloudflare deployment and production smoke test have succeeded.

## Environment

Use only the variables in [`.env.example`](.env.example):

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=https://YOUR_PRODUCTION_HOST
GEOAPIFY_API_KEY=YOUR_GEOAPIFY_KEY
```

`GEOAPIFY_API_KEY` is server-side only and powers event location/address autocomplete and coordinate resolution. The active crew app does not require a Supabase service-role key.

## Local checks

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

CI runs the same lint/type/test/build/Cloudflare validation.

## Database

The production project is tracked through ordered SQL migrations in `supabase/migrations/`. Historical StaffPortal migrations `001`–`025` are retained because they are part of the recorded migration history; they are not active application modules.

Do not reset or blindly replay migrations against the existing Uptilldawn project. A full from-zero replay must be verified on an isolated Supabase project before the repository is described as fresh-install safe.

Database security regression suites live in `tests/sql/`.

## Deployment

Read [DEPLOYMENT.md](DEPLOYMENT.md). The application uses SSR, Server Actions, authenticated cookies and route handlers, so it is deployed as a Cloudflare Worker through OpenNext rather than as a static export.

## Important documents

- [Implementation status](UPTILLDAWN_IMPLEMENTATION_STATUS.md)
- [Deployment](DEPLOYMENT.md)
- [Architecture](ARCHITECTURE.md)
- [Security](SECURITY.md)
- [Roadmap](ROADMAP.md)
- [Legacy removal record](LEGACY_REMOVAL.md)
