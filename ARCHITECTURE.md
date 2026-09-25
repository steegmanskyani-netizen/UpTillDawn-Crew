# Uptilldawn architecture

## Runtime

```text
Browser / installed PWA
        |
        v
Next.js + OpenNext Cloudflare Worker
  - Server Components / Server Actions
  - Auth callback and app routes
  - Geoapify server route
  - XLSX export
  - Workers AI maker-only Edit assistant
        |
        v
Supabase
  - Auth
  - PostgreSQL + RLS
  - private Storage
  - Realtime
  - pg_cron / pg_net
  - push-notification Edge Function
        |
        v
Platform Web Push services
```

The normal Cloudflare application uses the browser-safe Supabase publishable key and validated database/RLS boundaries. Web Push delivery is a separate trusted Supabase Edge Function and uses Supabase's built-in server-side service-role environment only inside that function.

## UI baseline

- `lib/role-ui.ts`: canonical role navigation labels/order/conditions.
- `components/layout/mobile-nav.tsx`: canonical contextual mobile quick tabs and expandable navigation.
- `components/layout/app-layout.tsx`: shared role/context visibility enforcement.
- `public/sw.js`: offline fallback, push and installed-PWA background hooks.

The live `role_ui_rules` rows are kept aligned with the repository defaults.

## Authorization model

Roles stored in `profiles.role`:

- `staff`
- `responsible_lead`
- `admin`

Operational authorization is narrower than labels alone: event membership, workplace assignment, active event/shift context and Admin/Responsible scope are revalidated in RLS/RPCs.

Sensitive changes use validated SECURITY DEFINER RPCs with explicit authentication/authorization checks and fixed `search_path`. Direct browser mutation is intentionally restricted on protected operational tables.

## Offline model

IndexedDB stores pending operations/uploads with immutable client operation IDs. Server replay is idempotent and conflict-aware. The service worker does not cache authenticated HTML as a substitute for authorization; offline operation state is a separate non-sensitive operational shell/snapshot.

## Storage

Private buckets:

- `profile-photos`
- `checkin-selfies`
- `incident-photos`
- `chat-attachments`

Access is scoped through RLS and short-lived signed URLs where required. Accepted operational evidence is not directly deletable by ordinary authenticated uploaders.

## Push model

Subscriptions are user/device scoped. Database notification inserts asynchronously invoke the push Edge Function through `pg_net`; the Edge Function sends Web Push and removes expired endpoints when providers report them invalid.

## Database history

The repository contains 107 ordered migration files matching the current production migration-history count at this baseline.
