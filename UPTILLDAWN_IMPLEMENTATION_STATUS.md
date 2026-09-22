# Uptilldawn implementation status

This is a verified hardening milestone, **not a production-complete release**.

## Verified in this change

- Connected to the existing project `eakoavcieossazqzplke`; the obsolete project was not used.
- Restored 16 already-applied migration files from remote migration history. New changes use new migrations; corrective migrations remain in history.
- Repaired recursive profile RLS. Authentication and the client provider use `profiles.approved` and `profiles.role`, not retired StaffPortal tables. Removed raw database errors from login responses. Approval is checked server-side and in database operations.
- Revoked browser-role TRUNCATE privileges. Restricted sensitive profile columns; administrators have an authorized RPC to retrieve them. Added audited account changes.
- Added restrictive approval policies. Scoped work/break reads to the responsible lead's workplace. Restricted workplace chat/attachments. Disabled uncontrolled direct writes to operational messages, incidents, attachments and synchronization records.
- One 60-minute paid-break allowance per employee/event, shared chronologically across work sessions. The implementation treats one event as one work period; a separate multi-day work-period model is not yet defined.
- Added controlled, atomic synchronization with operation IDs, payload-conflict checks and advisory locks. Replayed time and urgent operations return the existing result. IndexedDB preserves pending actions per account; retries retain errors. A failed time action does not block independent urgent reports/messages.
- Added check-in/out UI, approval UI, signed selfie retrieval, explicit work/break controls, current summary, valid active-shift transition check and separate checkout controls after stopping work.
- Remote selfie paths must belong to the caller, exist in private storage, be uploaded within ten minutes and not have been used for another check-in. Browser camera behavior remains a device test gate; the current capture input is a camera hint, not proof of original capture time.
- GPS captured only for explicit start/stop/urgent actions. Server computes radius status from coordinates and accuracy; denied/unavailable/offline/poor accuracy are not marked verified. Coordinates are device-reported, not cryptographically attested.
- Added event creation, editing of name/location/GPS settings, archive and configuration duplication. Duplication copies workplaces, briefings and task templates, not personnel assignments or historical operations.
- Added task assignment/progress UI, briefing and personal-instruction acknowledgement UI, in-app check-in/out notifications, urgent notifications, realtime text chat and server-scheduled break warnings.
- The minute cron job inserts the staff warning at 55 minutes and responsible/admin warning at 70 minutes only while a break is active, with deduplication. Delivery is in-app, not Web Push.
- Replaced export with a real ExcelJS `.xlsx`, admin authorization and audit. Rows represent workplace segments; durations are not duplicated in separate total rows. Tests cover paid-break allocation, midnight and DST. Exports fail visibly at the current 1,000-row pagination boundary.
- Removed obsolete office/leave/kiosk routes and actions that depend on tables absent from this database. See `LEGACY_REMOVAL.md`. Kept the existing Uptilldawn architecture, login design/logo, migrations and applicable core components.
- Replaced the service worker's cached authenticated homepage with a public offline fallback. User-specific HTML and APIs are not cached.
- Re-enabled TypeScript enforcement in production builds. Added Cloudflare Workers/OpenNext configuration and a lockfile with exact Supabase package versions.

## Verification executed

- `npm ci --ignore-scripts --no-audit --no-fund` completed at baseline.
- Initial baseline: 35 Node tests passed, typecheck failed, production build failed; lint had 757 warnings.
- Updated Node suite: 39 tests passed, including four behavioral time-allocation tests.
- Updated TypeScript check passed.
- Updated ESLint passed with warnings; warnings have not been represented as a clean lint report.
- Next.js production build passed with typechecking enabled.
- OpenNext Cloudflare build passed.
- Wrangler deployment dry-run passed after correcting repeated-build environment-output duplication. No production deployment was performed.
- Local production HTTP smoke tests passed: login/admin login/signup 200, protected operations/events/personnel redirected to login, anonymous XLSX access 401, offline fallback and service worker 200. These are HTTP checks, not authenticated browser end-to-end tests.
- Dependency resolution while adding the adapter selected Next.js 16.3.6; Next/React and Supabase runtime versions are pinned in package.json and the lockfile.
- `tests/sql/operational-security.sql` executed against the target database in a transaction and rolled back. It tests profile isolation, self-promotion denial, cross-workplace access/approval denial, unapproved accounts, anonymous RPC privileges, sensitive-column denial, shared break allowance, repeated operation delivery, payload conflicts, geofence/accuracy behavior, briefing acknowledgement, event duplication without historical records, a successful work/break lifecycle, stored GPS evidence and warning deduplication.
- Supabase security advisors: the mutable function search-path warning was repaired. Intentional authenticated SECURITY DEFINER entry points remain flagged for review; the private warning-receipt table has RLS and no client policy/access. Leaked-password protection remains disabled. Advisor output is not a substitute for the explicit role tests.

## Still required before production

1. Cloudflare authentication and production environment/redirect configuration; deployment and production smoke tests. No URL has been created or verified.
2. Real-browser end-to-end tests using separate Admin, Responsible and Staff accounts, including denied permissions, GPS/camera hardware, signed storage retrieval, mobile layouts, session expiry, concurrent devices and offline reload.
3. Full offline application shell for reopening while disconnected; queued upload support; a usable conflict-resolution screen and complete sequencing of time actions that begin offline. The present offline fallback is not a full offline-first application.
4. Web Push subscriptions and delivery; additional briefing/task change notifications and operational notification links.
5. Complete personnel forms for address, birth date, national number, IBAN and permanent photo, plus safe crew directory UI. Sensitive columns are already protected.
6. Complete Responsible management UI, crew live-status dashboard, incident resolution UI, admin time-correction UI, editing/personal-instruction authoring workflows and private-chat creation/moderation/photo attachments.
7. Export pagination and an explicit overtime/work-period policy. Overtime is visibly marked “Niet vastgesteld”; no invented overtime values are exported.
8. More extensive storage/attachment and complete table-by-table RLS/privilege regression coverage. The tested subset must not be described as a complete security audit.
9. Replay the entire historical schema on an isolated database before claiming a fresh-install workflow. The live project's manually evolved baseline and recovered migrations have not been reset or recreated.

The database migrations in this branch have already been applied to the target project. The application code is isolated on a Git branch for review. Do not deploy or mark this complete solely because the build passes.
