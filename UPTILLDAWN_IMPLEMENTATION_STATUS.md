# Uptilldawn implementation status

This is a verified hardening milestone, **not a production-complete release**.

**Current implementation estimate: ~94%.** This estimate counts only implemented and verified work; production deployment, browser/device E2E and the remaining offline/Web Push work are not counted as complete.

## Verified implementation

- Target Supabase project is `eakoavcieossazqzplke`; the obsolete project is not used.
- Authentication and authorization use `profiles.approved` and `profiles.role`. Unapproved accounts are rejected with `ACCOUNT NOT APPROVED`. Raw database errors are not exposed from login.
- Profile RLS recursion was repaired. Browser TRUNCATE privileges were revoked. Sensitive personnel fields are not directly readable by ordinary crew.
- Full personnel profile workflow is available for name, address, phone, date of birth, Belgian national-register number, IBAN and permanent private profile photo. Self-service access uses scoped RPCs; admins have a protected personnel-details RPC. Sensitive values are not written into audit metadata.
- Safe crew-directory data is limited to approved users' name, phone and profile photo. A dedicated Crew page is available to approved Staff, Responsible and Admin users. Private profile-photo reads use short-lived signed URLs. A storage-RLS regression found and fixed a profile-photo policy bug caused by nested profile RLS.
- Admin account approval and role changes are server-authorized and audited. Users cannot promote or approve themselves.
- Event creation/edit/archive and configuration duplication are implemented. Duplication copies reusable configuration but not work sessions, check-ins, incidents or other historical operational records.
- Workplaces and multiple Responsible assignments are implemented. Responsible users see and manage only assigned workplaces.
- Shift creation/edit/cancellation is available to admins and scoped Responsible leads. New shift RPCs validate event membership, authorization and time ranges, reject overlaps unless explicitly allowed, and block destructive edits while an active work session exists.
- Check-in/check-out requests, Responsible/Admin decisions and signed remote-selfie retrieval are implemented. Remote selfie ownership/existence/freshness/non-reuse validation remains server-side.
- Work/break timing uses server-authoritative RPCs. Only one active work session and one active break are allowed. START WORK / START BREAK / STOP BREAK / STOP WORK and workplace transitions are implemented.
- One 60-minute paid-break allowance is shared chronologically per employee/event. Excess break is deducted from payable time. The current work-period model treats one event as one work period.
- Staff warning at 55 minutes and Responsible/Admin warning at 70 minutes are generated while a break is active, with deduplication.
- GPS is captured only for explicit operational actions. Radius/accuracy status is computed server-side; denied/unavailable/poor-accuracy states are not falsely marked verified.
- Responsible live crew-status UI shows visible active work sessions, break state, workplace and safe contact data.
- Admin time-correction UI uses the audited correction RPC and preserves original/corrected values in correction history.
- Briefings support create/edit/versioning and renewed acknowledgement after content changes. Personal instructions support authoring, editing, versioning and per-user acknowledgement.
- Task packages support assignment/progress. Responsible leads can create/remove assignments only within their own workplace.
- URGENT incidents support persistent text, explicit GPS evidence and optional private photos. Incident acknowledgement/resolution is limited to Admin or the Responsible for the linked workplace and is audited. Authorized incident photos are shown through short-lived signed URLs.
- Organization/event/workplace chat access is enforced in the database. Private 1:1 chat creation, realtime text, private photo attachments, safe sender names and audited Admin moderation are implemented. Ordinary users have no delete/moderation action.
- In-app notifications include check-in/out, URGENT, briefing changes, personal-instruction changes and task assignments. Internal notification links and controlled mark-read behavior are implemented.
- IndexedDB keeps pending operational actions per user. Sync uses unique operation IDs, advisory locking, payload-conflict detection and idempotent replay. Failed ordered time actions do not silently disappear. Later queued START BREAK / STOP BREAK / STOP WORK / workplace-transition actions may safely reference the server entity created by an earlier queued START WORK / START BREAK operation.
- A dedicated Synchronisatie screen shows pending operations, retry state and conflicts and requires explicit confirmation before discarding an unconfirmed local operation. A cached offline operations shell reopens after the authenticated app has been closed, uses a per-user non-sensitive snapshot, shows queued actions/files and allows offline work/break/transition plus URGENT text/photo capture. Sign-out clears the active offline identity without silently deleting that user's queue.
- Text/time/task/URGENT queue operations can be retained offline. URGENT incident photos and chat photos are stored as Blobs in IndexedDB and uploaded later with idempotent server RPCs. The sync screen shows queued files and never silently drops them. Profile-photo updates and fresh remote check-in selfies remain online-only; the selfie freshness rule intentionally prevents replaying stale offline captures.
- Private storage buckets exist for profile photos, check-in selfies, incident photos and chat attachments with MIME/size constraints and scoped read policies. Direct authenticated DELETE policies were removed for check-in selfies, incident photos and chat attachments so accepted operational evidence cannot be erased by the uploader; profile-photo replacement remains separate.
- ExcelJS export is Admin-only and audited. It exports workplace-segment rows without double counting and now paginates PostgREST datasets beyond the former 1,000-row boundary.
- Export still reports overtime as `Niet vastgesteld` because no approved overtime rule has been defined.
- Obsolete StaffPortal office/leave/kiosk routes/actions that depended on absent tables were removed. See `LEGACY_REMOVAL.md`.
- Authenticated homepage HTML/API responses are not cached by the service worker. The service worker uses a privacy-safe public fallback for auth routes and a separate operational offline shell for app routes; the operational shell does not cache authenticated HTML.
- TypeScript enforcement is enabled in production builds. Cloudflare Workers/OpenNext configuration is present.

## Database migrations added in this hardening continuation

The following migrations have been applied successfully to the target project:

- `uptilldawn_incident_resolution`
- `uptilldawn_profile_details`
- `uptilldawn_responsible_management`
- `uptilldawn_chat_management`
- `uptilldawn_incident_photo_submission`
- `uptilldawn_notification_links`
- `uptilldawn_queued_photo_uploads`
- `uptilldawn_profile_photo_rls_fix`
- `uptilldawn_operational_media_immutability`
- `uptilldawn_anon_privilege_hardening`
- `uptilldawn_offline_time_dependencies`

Generated TypeScript database types were refreshed from the live target schema after these changes.

## Verification executed

- Node suite: 39 tests passed at the established baseline, including paid-break allocation, midnight and DST behavior.
- Recent GitHub CI runs pass lint, TypeScript checking, Node tests, the Next.js production build, the OpenNext Cloudflare build and Wrangler deployment dry-run for the current implementation commits. This is not a production deployment.
- Local HTTP smoke tests previously passed for public/auth redirects, anonymous export denial, offline fallback and service worker. These are not authenticated browser E2E tests.
- `tests/sql/operational-security.sql` was rerun against the target database inside a transaction and rolled back successfully after the new migrations. It covers profile isolation, self-promotion denial, cross-workplace access denial, unapproved accounts, anonymous RPC privileges, shared break allowance, sync replay/conflicts, GPS assessment, briefing acknowledgement, event duplication, work/break lifecycle, stored GPS evidence and warning deduplication.
- `tests/sql/new-feature-security.sql` was executed against the target database inside a transaction and rolled back successfully. It verifies self-service sensitive-profile privacy, private chat membership, moderation authorization/audit, Responsible workplace-scoped shift creation, overlap prevention, cross-workplace denial and the URGENT acknowledge/resolve lifecycle.
- `tests/sql/queued-upload-security.sql` was executed against the target database inside a transaction and rolled back successfully. It verifies idempotent queued incident-photo attachment and queued chat-photo message creation using synthetic private-storage metadata.
- `tests/sql/storage-security.sql` was executed against the target database inside a transaction and rolled back successfully. It verifies approved profile-photo access, unapproved denial, Responsible access to linked check-in/incident evidence, private-chat attachment membership isolation and the absence of direct authenticated DELETE policies for operational media.
- `tests/sql/privilege-matrix.sql` passed against the target database. All public base tables have RLS enabled, `anon` has no public-table/Uptilldawn-RPC grants, no crew RLS policy is granted to `PUBLIC`, and trigger functions are not directly callable.
- `tests/sql/offline-time-dependencies.sql` passed against the target database. It verifies an ordered queued START WORK → START BREAK → STOP BREAK → STOP WORK chain using operation dependencies instead of pre-existing server entity IDs.
- The full operational, new-feature, queued-upload, storage, privilege-matrix and offline-time-dependency SQL suites were rerun after the latest privilege/offline migrations and all passed.
- Current Supabase security advisor has no new missing public-table RLS finding from these migrations. It still reports the intentionally private `upt_private.break_warning_receipts` table as RLS-without-policy, flags authenticated `SECURITY DEFINER` RPC entry points for review, and reports leaked-password protection disabled. Advisor output is not treated as a complete security audit.

## Still required before production

1. **Production deployment:** Cloudflare authentication, production environment variables/redirects, deployment and production smoke tests. No production URL or `pages.dev` address has been verified.
2. **Real browser/device E2E:** separate Admin/Responsible/Staff accounts, denied-permission scenarios, GPS/camera behavior, signed storage retrieval, mobile layouts, session expiry, concurrent devices and offline reload.
3. **Remaining offline breadth:** the app now has a reopen-offline operational shell for work/break/transition and URGENT workflows, but every screen is not yet available offline. Briefing/task/chat browsing, profile-photo updates and fresh remote check-in selfie submission still require online handling; stale remote selfies are intentionally not replayed.
4. **Web Push:** in-app notifications are implemented, but push subscription and external push delivery are not.
5. **Policy decision:** define overtime and, if required, a work-period model different from the current one-event allowance model. The system deliberately does not invent payroll policy.
6. **Broader security regression coverage:** the public-table/RPC privilege matrix and private-storage regression suites now exist and pass. Additional adversarial browser/device testing is still required before describing the system as security-audited.
7. **Fresh-install proof:** replay the complete historical migration chain on an isolated database before claiming a clean-from-zero installation path.

The application code remains isolated on `codex/uptilldawn-production-hardening`. Production deployment must not be inferred solely from green CI.
