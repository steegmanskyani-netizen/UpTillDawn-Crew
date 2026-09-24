# Uptilldawn architecture

## Runtime

Uptilldawn is a single Next.js 16 App Router application on React 19.

```text
Browser / installed PWA
        |
        v
Next.js + OpenNext Cloudflare Worker
  - Server Components
  - Server Actions
  - Auth callback
  - XLSX export route
        |
        v
Supabase
  - Auth
  - PostgreSQL + RLS
  - private Storage
  - Realtime
  - pg_cron break notifications
```

There is no separate trusted application backend and no service-role key in the active runtime. Browser and server code use the Supabase publishable/anon key; authorization is enforced by authenticated RPCs, RLS and server-side role checks.

## Application areas

- `app/(auth)/` — login, registration, verification and password recovery
- `app/(app)/operations/` — check-in/out, work/break and workplace transitions
- `app/(app)/events/`, `workplaces/`, `shifts/` — event configuration
- `app/(app)/briefings/`, `tasks/` — crew instructions and task packages
- `app/(app)/chat/` — realtime crew chat
- `app/(app)/incidents/` — URGENT incident workflow
- `app/(app)/admin/` — operational admin dashboard and time corrections
- `app/api/uptilldawn/export/` — admin XLSX export

## Authorization model

Roles stored in `profiles.role`:

- `staff`
- `responsible_lead`
- `admin`

Unapproved accounts are rejected with `ACCOUNT NOT APPROVED`.

Sensitive changes use SECURITY DEFINER RPCs that validate `auth.uid()`, account approval and the relevant Admin/Responsible/ownership scope. Direct table mutation is intentionally restricted for timekeeping, approvals, incidents, chat moderation and offline replay.

## Offline model

The browser stores pending operations in IndexedDB with a client-generated operation UUID. The server records processed IDs in `offline_operation_records` and rejects conflicting reuse. Ordered time actions can reference the server entity produced by an earlier queued action.

Photo uploads for URGENT incidents and chat are stored as IndexedDB Blobs until both the private Storage upload and matching server RPC succeed.

A service-worker fallback serves a non-sensitive per-user operational snapshot after the authenticated page has been closed. It never fabricates server timestamps, GPS verification or approval state.

## Storage

Private buckets:

- `profile-photos`
- `checkin-selfies`
- `incident-photos`
- `chat-attachments`

Operational evidence cannot be directly deleted by authenticated uploaders after server acceptance. Access is scoped through RLS and short-lived signed URLs.

## Database history

Migrations are ordered in `supabase/migrations/`. The local filenames are aligned with the migration versions recorded in the target Supabase project. Historical pre-Uptilldawn migrations remain because they are part of that history.
