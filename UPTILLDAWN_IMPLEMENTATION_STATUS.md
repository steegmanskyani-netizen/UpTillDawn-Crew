# Uptilldawn implementation status

## Current production baseline

Uptilldawn is deployed from `main` to the Cloudflare Worker at `https://crew-uptilldawn.be`, using Supabase project `eakoavcieossazqzplke`.

The current desktop/web view and installed mobile PWA view are the canonical defaults. The live `role_ui_rules` rows have been checked against `ROLE_UI_DEFAULTS` in `lib/role-ui.ts` and match the repository baseline.

### Canonical mobile quick tabs

- Staff, assigned event: Evenementen, Briefing, Mijn shift's, Werkplekken.
- Staff, active shift: Mijn werkuren, Mijn shift's, Briefing, Taken.
- Responsible, assigned event: Evenementen, Briefing, Shift's, Werkplekken.
- Responsible, active shift: Mijn werkuren, Shift's, Werkplekken, Help.
- Mobile navigation shows a compact set with an up/down expand control rather than horizontal swipe.
- Responsible overview shows own-workplace personnel name/status plus live work/pause timers.
- Staff overview shows own-workplace personnel name/status without timers.
- Admin Workplace management can promote staff to Responsible and return a Responsible to Staff while preserving other valid Responsible assignments.

### PWA / notifications

- Service worker is registered with update checks and privacy-safe offline fallbacks.
- Installed PWA refresh checks run on registration, focus, visibility return, online return and push; Periodic Background Sync is registered where the platform supports it.
- Web Push subscriptions are per authenticated user/device and require user permission.
- New `crew_notifications` rows enqueue delivery through `pg_net` to the `push-notification` Supabase Edge Function; the dispatch timeout is 10 seconds to tolerate cold starts without false timeout records.
- VAPID private material and webhook secret are kept outside the public repository.
- Invalid/expired push subscriptions are cleaned automatically on 404/410 delivery responses; non-HTTPS and local/private-network push targets are rejected before delivery.
- Push notification links are restricted to local app paths; protocol-relative escape paths are rejected.
- Private Storage writes require an approved account in addition to user-owned folder scoping.
- Notification clicks open the linked in-app destination.

The Edit-mode access code is no longer present in source code. Only a SHA-256 hash is stored in the private database schema and verification is server-authorized.

## Verified application areas

- Auth, approval, role switching and immutable maker/admin protection.
- Event, workplace, shift and Responsible assignment workflows.
- Check-in/out and audited work/break timing.
- Briefings, personal instructions, tasks, help/incidents and workplace-scoped chat.
- Private media storage and signed/scoped reads.
- Responsible/Staff/Admin role-specific dashboards.
- Offline operation/upload queues and operational offline shell.
- Admin time corrections, audit and Excel export.
- Device-language synchronization.
- Cloudflare Workers AI maker-only Edit mode assistant.
- Cloudflare production deployment and Supabase push Edge Function.

## Cleanup / regression verification

The current cleanup reran all 13 SQL regression files in `tests/sql/` against the target Supabase project using rollback fixtures. During that run, several tests were found to encode obsolete product behavior and were corrected to the current baseline:

- Responsible scope is workplace-assignment based rather than broad event-wide workplace access.
- Staff may see their assigned future workplace/shift according to current role UI rules.
- Responsible cannot create workplaces or pre-shift tasks.
- Legacy private-chat assumptions were replaced by current workplace-chat behavior; the remaining private-chat peer RPC and direct `chat_members` read grant were revoked.
- Incident/media Responsible fixtures now include the active-shift context required by current rules.

The corrected SQL suites pass, including privilege/RLS, SECURITY DEFINER surface, release access, profile-role integrity, foreign-key coverage, Responsible read scope, operational security, chat lifecycle, queued uploads, storage security, offline time dependencies and event-selection guards.

Repository CI is expected to remain the release gate for lint, TypeScript, Node tests, production builds and Wrangler dry-run.

## Full option/function audit

A full option/function audit was run against the current production baseline. Coverage included all role views, auth portals, event/workplace/shift flows, work and break timing, task/instruction acknowledgement, chat/media, incidents/help, profile/settings, notifications, export/audit, offline sync, PWA/Web Push, Edit mode and server API routes.

The audit also checked the database attack surface rather than only the visible UI:
- all 13 SQL regression suites pass against production using rollback fixtures;
- every public application table has RLS enabled;
- anonymous table CRUD grants are absent;
- anonymous/PUBLIC execute access to `upt_*` RPCs is absent;
- retired private-chat creation/peer discovery remains revoked;
- generated Supabase TypeScript types exactly match the production schema;
- repository and production migration histories match 108/108.

Issues found and corrected during this audit:
- permanent-admin server routes now use the central admin privilege check;
- initial language selection follows the device/browser language until the user explicitly chooses another language;
- Admin login through Personnel/Responsible selects the matching visible role mode;
- Push subscriptions are removed on logout/auth loss and unsafe/private-network push endpoints are rejected;
- notification links cannot escape the app origin;
- private Storage writes require approved-account/user-folder scope;
- Responsible/Staff preview data is restricted to the effective role for chat, operations, shifts, tasks, workplaces, incidents, badges, events and overview;
- Edit-mode code is no longer in source and database writes require a temporary verified unlock with failed-attempt rate limiting;
- AI Edit-assistant POSTs reject cross-site origins.

## Supabase advisor state

Known remaining advisor findings are reviewed rather than blindly removed:

- `admin_role_modes`, `push_subscriptions` and the private `app_owners` / Edit-code / Edit-unlock / Edit-attempt tables have RLS with no browser policies intentionally; browser table grants are not the access path.
- Authenticated SECURITY DEFINER RPC warnings correspond to explicit application RPC boundaries and remain covered by the security regression suite.
- `pg_net` is reported as installed in `public`; the installed extension is non-relocatable and creates/uses its own `net` schema.
- Leaked-password protection remains a Supabase Auth project setting to enable.
- Performance advisor findings are unused-index informational notices; foreign-key index coverage passes.

## Remaining non-UI decisions / improvements

These are not regressions in the current web/mobile baseline:

1. Define an explicit overtime/pay-period policy before presenting overtime as payroll truth.
2. Replay all 108 migrations from zero on an isolated project before claiming a fresh-install proof.
3. Expand offline browsing beyond the operational workflows if full offline parity is ever required.
4. Continue physical-device regression testing after major browser/OS updates.
5. Enable Supabase leaked-password protection when the project setting is approved.

The current web/mobile/PWA layout and behavior should be treated as default unless a future change is explicitly requested.
