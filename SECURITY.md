# Security

## Supported code

`main` is the canonical production branch. Older commits are not maintained as separately supported versions.

## Security model

- Supabase Auth provides authentication.
- Active public application tables use RLS.
- Unapproved accounts cannot use crew operations.
- Admin and Responsible permissions are rechecked in RPC/RLS logic.
- Timekeeping and approval timestamps are server-authoritative.
- Offline replay uses immutable operation IDs and conflict detection.
- Direct authenticated mutations are revoked where RPC/trigger boundaries are required.
- Sensitive media is stored in private Supabase Storage.
- Push subscriptions are associated with the authenticated user and are not exposed as a generally readable browser table.

SECURITY DEFINER RPCs are intentional only where a validated privileged workflow is required. They must retain explicit caller/role/ownership checks and fixed `search_path`.

## Service-role boundary

The browser and Cloudflare app runtime do **not** contain a Supabase service-role key.

The `push-notification` Supabase Edge Function uses Supabase's built-in server-side service-role environment to read the target notification/subscriptions and clean expired push endpoints. That credential remains server-side inside Supabase and is never committed or returned to the client.

## Storage write gating

Private Storage uploads are constrained by bucket MIME/size limits, approved-account status and user-owned folder scope. Operational evidence buckets do not expose ordinary authenticated delete policies.

## Push endpoint safety

Push registrations require HTTPS provider hostnames. The app route, database save RPC and delivery Edge Function independently reject literal IPv4/IPv6 targets (including mapped IPv6 forms), URL credentials and local hostname suffixes. Notification clicks accept only local single-slash app paths.

## Push secrets

The VAPID private key and internal push-webhook secret are private server configuration. Only the VAPID public key is exposed to authenticated clients for Push API subscription.

## Edit-mode code

The Edit-mode access code is environment data. Its hash is stored in `upt_private.admin_edit_config`; the raw code is not committed to GitHub or exposed to the browser. Verification is restricted to approved permanent-admin callers through `upt_verify_admin_edit_code`.

## Legacy bootstrap closure

The former info-admin bootstrap is fully removed. The e-mail-confirmation promotion trigger, bootstrap/status and forced-password helper RPCs, and the private password-change marker table are absent. Normal login contains no bootstrap credential.

## Secrets never committed

- Supabase secret/service-role keys
- VAPID private keys
- internal webhook secrets
- Cloudflare API tokens
- database passwords
- personal access tokens
- local `.env.local`

Legacy private-chat creation/peer discovery is not part of the production app. Authenticated execute/read grants for that retired surface are revoked.

## Regression verification

Security regression SQL lives in `tests/sql/` and is designed to run with synthetic fixtures inside transactions that roll back. The current baseline includes privilege/RLS, SECURITY DEFINER surface, role/event lifecycle, workplace scope, storage, queued media, chat lifecycle, offline-time and foreign-key coverage.

CI also runs dependency audit, lint, TypeScript and production builds.

## Known project-level advisor items

- Supabase leaked-password protection is still a project setting to enable.
- `pg_net` is non-relocatable; the advisor may report its extension installation namespace even though runtime requests use the dedicated `net` schema.
- Some intentionally RPC-only/RLS tables have no browser policies because direct browser table access is not part of their design.
- Authenticated SECURITY DEFINER warnings require review against the validated RPC surface; they are not automatically removed solely to silence the advisor.
