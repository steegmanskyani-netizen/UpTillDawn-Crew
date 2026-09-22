# UPTILLDAWN Crew Management — integrated build

Implemented in migrations 026–028 and application routes:
- account approval foundation and Admin / Responsible Lead / Staff scopes
- events, default workplaces, event members, responsible assignments and shifts
- overlap guard for shifts
- incidents / URGENT persistence foundation
- briefings + versioned acknowledgements
- tasks
- check-in and check-out approval data model with GPS verification states and remote selfie path
- server-authoritative work sessions and break transitions
- workplace transition records
- chat channel/message schema
- notifications and audit log
- offline operation/idempotency records
- private Supabase storage buckets
- PWA manifest, service worker registration and offline shell fallback
- admin Excel endpoint and audit entry

## Required before production
1. Apply Supabase migrations in numeric order through 028.
2. Configure NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and server-only SUPABASE_SERVICE_ROLE_KEY.
3. Complete a clean `npm install`, `npm run typecheck`, `npm test`, and `npm run build` in a Node >=22.6 environment. Dependency installation timed out in the build sandbox, so this package is NOT claimed as build-verified.
4. Security-test every RLS policy with separate admin/responsible/staff accounts before entering real personal data.
5. GPS capture UI, camera upload UI, Web Push delivery, richer realtime chat UI, break warning scheduling, correction UI and offline replay worker still require production hardening/integration. The database/state foundations are present; do not treat them as verified end-to-end features yet.
6. Never expose SUPABASE_SERVICE_ROLE_KEY to the browser or commit it.
