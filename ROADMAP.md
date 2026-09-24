# Uptilldawn roadmap

The application is in production-hardening, not final production release.

## Completed

- Core Auth / approval / role model
- RLS and authenticated mutation boundaries
- Event, workplace and shift management
- Check-in/out approval
- Work/break tracking and 60-minute break allowance
- Workplace transitions
- Briefings, personal instructions and tasks
- Realtime chat, private chat, moderation and photo attachments
- URGENT incident workflow and private incident photos
- Admin time corrections, audit and XLSX export
- Responsible live crew view
- Admin operational dashboard
- IndexedDB offline operation/upload queues
- Reopen-offline work/break/transition/URGENT shell
- Cloudflare/OpenNext build and Wrangler dry-run validation
- SQL security regression suites

## Release gates still open

1. Browser/device E2E with separate Staff, Responsible and Admin accounts.
2. Real camera/GPS tests, including denied/poor-accuracy/offline cases.
3. Web Push if it is retained as a release requirement.
4. Explicit overtime/pay-period policy before payroll-style overtime output is enabled.
5. Complete migration replay on an isolated Supabase project.
6. Cloudflare production credentials, deployment and production smoke test.
7. Enable Supabase leaked-password protection in the Auth project settings.

## Later improvements

- Broader offline browsing for briefings/tasks/chat history
- Optional notification preference controls
- More adversarial concurrency/device testing
- Operational observability after production traffic exists
