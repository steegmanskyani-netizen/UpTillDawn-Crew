# Legacy StaffPortal removal

The repository originated from a broader StaffPortal codebase. The active runtime has been reduced to Uptilldawn crew management.

Removed from the runtime:

- attendance, leave, expenses, purchase requests and office workflows
- kiosk, visitors, diary, complaints, feedback, IT, wellness and SSO routes
- legacy cron and GDPR endpoints
- StaffPortal server actions and service-role client
- unused UI/editor/chart components
- legacy PWA manifests, Vercel cron config and StaffPortal branding
- legacy helper modules and their unit tests
- the old manual `supabase/run-in-sql-editor.sql` script

Historical migrations `001`–`025` remain intentionally because they are part of the target Supabase migration history. Later Uptilldawn migrations retire the old exposed schema and establish the current crew schema.

Git history preserves deleted source if a historical comparison is needed.
