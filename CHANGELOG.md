# Changelog

## Unreleased — Uptilldawn production hardening

### Added

- Uptilldawn Staff / Responsible / Admin portal flows.
- Event, workplace, shift, briefing, task, chat, incident and personnel workflows.
- Server-authoritative work/break tracking with shared 60-minute break allowance.
- Check-in/out approval, remote selfie validation and GPS evidence.
- Admin time correction history, audit log and XLSX export.
- Responsible live crew status and Admin operational dashboard.
- IndexedDB operation and photo queues with idempotent server replay.
- Reopen-offline operational shell for work/break/transitions and URGENT reports.
- Guarded Cloudflare deployment workflow and OpenNext/Wrangler validation.
- SQL regression suites for operational authorization, storage, queued uploads, privileges and offline dependencies.

### Security

- Removed anonymous direct access to Uptilldawn public tables/RPCs.
- Restricted profile sensitive fields and role/approval mutation.
- Restricted Responsible access to assigned workplace scope.
- Restricted private chat and private media access.
- Prevented authenticated direct deletion of accepted operational media.
- Aligned local migration filenames with the target Supabase migration history.
- Fixed Responsible event/workplace read scoping and enforced Responsible event-membership consistency.
- Removed unsupported personnel status choices and added explicit Admin/manager route guards.
- Patched the transitive `uuid` advisory through a tested v11.1.1 override; `npm audit` now reports 0 known vulnerabilities.
- Removed redundant database indexes, added hot-path covering indexes and made the private break-warning deny policy explicit.

### Cleanup

- Completed a Dutch-language UI/auth copy sweep and normalized navigation labels.
- Tightened active lint rules from warnings to CI-blocking errors.
- Fixed public/auth offline routing so login, signup, recovery and account-state pages always use the privacy-safe fallback.
- Added a database constraint limiting profile roles to Staff, Responsible Lead or Admin.
- Fixed the crew dashboard so "Komende events" excludes finished events.
- Rechecked live generated Supabase types and local/remote migration history for exact alignment.

- Retired StaffPortal application routes and actions are removed from the runtime.
- Legacy runtime utilities, UI components, tests, manifests and deployment config were removed while historical database migrations remain intact.

See [UPTILLDAWN_IMPLEMENTATION_STATUS.md](UPTILLDAWN_IMPLEMENTATION_STATUS.md) for executed verification and remaining release gates.
