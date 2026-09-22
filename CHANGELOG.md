# Changelog

All notable changes to StaffPortal are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Pure `computeCarryForward` helper in `lib/leave-accrual.ts` driving the
  year-end rollover. The carry-forward arithmetic (cap at
  `max_carry_forward`, strip prior carry so it never compounds, floor at
  zero so an over-spent balance never carries negative days) is now shared
  with `/api/cron/year-end-rollover` and covered by
  `tests/leave-carry-forward.test.mjs`.
- `assertGdprCoverage` guard in `lib/gdpr.ts`. The export route asserts at
  module load that it covers every table declared in `GDPR_TABLES`, so a
  forgotten personal-data table fails the build and tests rather than
  silently shipping an incomplete export.

### Fixed

- GDPR export now includes the `visitors` a member has hosted, which were
  declared in `GDPR_TABLES` but missing from the export route's `SOURCES`.
  The new coverage guard prevents the lists drifting again.

### Added (continued)

- Scannable QR code for visitors. The visitor detail page now renders an
  inline SVG QR (via `qrcode.react`, no network round-trip) encoding the
  visitor's reference code, so reception can scan it on arrival to look
  the visitor up.
- New wiki pages: `Attendance`, `Leave`, `Kiosk`, `Visitors`, `Crons`,
  `Reception`, `Diary`, and `Exports`, covering the per-area details that
  were previously folded into `Architecture` and `Home`.

### Added (earlier in this cycle)

- Single sign-on layered on Supabase Auth. Admins map an email domain to a
  provider (Microsoft Entra ID, Google Workspace, GitHub, GitLab, or SAML 2.0)
  under Admin, Single Sign-On. The login screen routes a member to their
  identity provider when their domain has an active connection.
- SSO provider-resolution helpers in `lib/sso.ts` with full unit coverage.
- First-time SSO sign-in now bootstraps a profile and the standard leave
  balances and records the login in the audit trail.
- Leave-balance accruals. Each balance can carry a monthly `accrual_rate`; a
  new cron route `/api/cron/leave-accrual` tops accruing balances up on the
  first of each month, capped at the configured entitlement, and is idempotent
  within a month. Admins and accounts staff can preview and run accruals under
  Admin, Leave Accruals.
- Pure accrual calculation in `lib/leave-accrual.ts` with unit coverage for the
  monthly cadence, the annual cap, and the idempotency guard.
- GDPR data export. A signed-in member can download a portable JSON document of
  every record held about them from Settings, Privacy and data. Admins can
  export another member via `/api/gdpr/export?userId=<id>`. Exports are audited.
- Bundle assembly for the export in `lib/gdpr.ts` with unit coverage.
- Admin sidebar links for Single Sign-On, Audit Log, and Leave Accruals.
- End-to-end logic test suites for SSO, accruals, and GDPR export, with shared
  fixtures under `tests/fixtures/`.
- Repository `CHANGELOG.md`, `ARCHITECTURE.md`, and `ROADMAP.md`.
- GitHub Actions workflow `leave-accrual.yml` and a Vercel cron entry for the
  monthly accrual job.
- Database migration `025_sso_accruals_gdpr.sql` adding the `sso_connections`
  table, accrual columns on `leave_balances`, and new audit-action enum values.

### Changed

- CI now runs on Node 24, which strips TypeScript test imports natively.
- The test script enables TypeScript type stripping so the pure-logic modules
  can be imported directly from `.mjs` test files.
- `engines.node` raised to `>=22.6.0` for native type stripping support.
- README rewritten to document SSO, leave accruals, GDPR export, and the
  expanded cron schedule, with an updated architecture diagram.

### Security

- GDPR exports of another user are restricted to administrators and recorded
  in the audit log.

## Final hardening pass
- Added migration 029 with authenticated-only work/break RPC execution.
- Validates that a supplied shift belongs to the signed-in employee and event.
- Added audit entries for break/work stop transitions.
- Added DB consistency constraints for approval decisions and remote check-in selfies.
- Added Uptilldawn-specific structural/security tests.
