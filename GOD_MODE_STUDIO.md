# God Mode App Studio

Open `/god-mode` with the dedicated God Mode login. This session is independent of the staff/admin login and remains subject to its two-hour expiry.

## Tools

- **Programmering:** browse repository text files, edit TypeScript/React/SQL/configuration, create and delete files, compare changes, import/export drafts, search/replace, undo/redo, format and insert a working button template.
- **Knoppen & onderdelen:** searchable build-generated index of JSX controls and exported functions. Open a component at its source line. Same-origin page inspection captures clicks to locate matching source; it uses the current ordinary app session and does not impersonate staff.
- **AI-programmeur:** proposes complete source changes using the selected and changed files. Proposals stay in a draft until reviewed and saved. It cannot silently publish or run SQL.
- **Gegevens:** inspect all application tables in `public`, insert records and edit/delete rows with primary keys. Writes are immediate, checked against the complete original row, and recorded in `upt_private.god_data_audit`. Cascaded deletions are governed by existing database constraints.
- **Logica & workflows:** SQL workbench with templates for functions, triggers, scheduled jobs and the God Mode data audit. Starts read-only. Writes require explicit confirmation for the current query. SQL execution does not automatically create a repository migration; retain schema changes as new migration files.
- **Rollen & navigatie:** existing role rule and layout editor.
- **Versies & publicatie:** each code change creates a `god-mode/*` branch and pull request. The specific revision must pass the `ci.yml` workflow and include current main before it can be merged. Cloudflare's existing main trigger builds and deploys the merged revision. A merge is not a deployment success. Source restoration creates a new reviewed change and does not restore database data.

## One-time connections

ChatGPT's GitHub/Supabase connector sessions cannot be transferred to a deployed website.

1. Under **Koppelingen**, provide a fine-grained GitHub token scoped to `steegmanskyani-netizen/UpTillDawn-Crew`. Required read/write permissions: Contents, Pull requests, Actions and Workflows (for editing workflow files). God Mode checks repository push access before storing it.
2. For free SQL, connect a Supabase Management API token authorized for project `eakoavcieossazqzplke`, with database read/write permissions. This is separate from the public browser key. Ordinary data editing does not require this connection.

Credentials are encrypted in Supabase Vault, never written to GitHub or browser storage, and can be disconnected. Every retrieval and modification RPC checks the private expiring God Mode session. HTTP routes additionally reject cross-site requests and use no-store responses. The public RPC grants support the dedicated God Mode cookie authentication, not anonymous access: absent/invalid/expired God tokens are rejected.

## Limits and recovery

The code editor edits text source; binary files are not treated as text. A changeset supports up to 30 files and 1.5 MB combined text. AI context is smaller and may require several focused requests. A new button's event handler must run in a client component, or use an appropriate server action.

Unsaved drafts stay in the current tab's memory. Export a draft before leaving; imports require the same repository base revision. Existing committed source history remains available through GitHub even if a source change removes the studio itself. SQL writes and cascaded data deletions require their own database recovery plan; restoring a source version does not undo them.

## Verification

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build:cloudflare`, and `npx wrangler deploy --dry-run`.

`tests/sql/god-mode-source-studio.sql` verifies rejected invalid sessions, safe table identifiers, insert/update/delete, stale-write rejection, primary-key-scoped deletion and audit entries. All fixtures are rolled back.
