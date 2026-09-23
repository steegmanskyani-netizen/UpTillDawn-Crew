# Security

## Supported code

Only the latest Uptilldawn code on the active release branch / merged `main` should be deployed. Older commits are not maintained as separate supported versions.

## Security model

- Supabase Auth provides user authentication.
- Every active public application table uses Row Level Security.
- Unapproved accounts cannot use crew operations.
- Admin and Responsible permissions are rechecked in database RPCs.
- The active application does not use a Supabase service-role key.
- Sensitive media is stored in private Supabase Storage buckets and exposed with scoped policies / short-lived signed URLs.
- Timekeeping and approval timestamps are server authoritative.
- Offline replay uses immutable operation IDs and conflict detection.

SECURITY DEFINER RPCs are intentionally exposed only where the authenticated application must perform a validated privileged workflow. They must keep explicit caller/role/ownership checks and a fixed `search_path`.

## Secrets

Never commit:

- Supabase secret/service-role keys
- Cloudflare API tokens
- database passwords
- personal access tokens

Only `NEXT_PUBLIC_SUPABASE_URL`, the publishable/anon key and the public app URL belong in the active application configuration.

## Reporting

Do not post credentials, private employee data or exploit details in a public issue. Contact the repository owner privately with the affected route/RPC, reproduction steps and impact.

## Dependency verification

CI runs `npm audit --audit-level=high`. The current lockfile resolves the transitive `uuid` dependency to patched v11.1.1 and the verified cleanup run reports 0 known npm vulnerabilities.

## Remaining project-level setting

Supabase leaked-password protection should be enabled before production release. This is an Auth project setting, not an application-code permission.
