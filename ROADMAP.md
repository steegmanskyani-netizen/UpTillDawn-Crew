# Uptilldawn roadmap

The current web/mobile/PWA experience is the production baseline.

## Completed baseline

- Auth / approval / role model and maker protection
- RLS and validated mutation boundaries
- Event, workplace, shift and Responsible management
- Check-in/out and work/break tracking
- Briefings, personal instructions, tasks and help/incidents
- Workplace-scoped chat and private media
- Responsible and Staff workplace overview status
- Admin operational dashboard and time corrections
- IndexedDB queues and operational offline shell
- Contextual mobile navigation with expandable compact bar
- Installed PWA manifest/service worker behavior
- Web Push opt-in, delivery, badge/click handling and subscription renewal
- Cloudflare production deployment from `main`
- SQL security/regression suite aligned to the current permissions model

## Ongoing / optional work

1. Define overtime/pay-period policy before payroll-style overtime output is enabled.
2. Complete a from-zero replay of all 108 migrations on an isolated Supabase project.
3. Broaden offline browsing if full offline parity becomes a requirement.
4. Continue cross-device regression testing after material iOS/Android/Windows/browser changes.
5. Enable Supabase leaked-password protection in project Auth settings.
6. Add more production observability/alerting as real usage volume grows.

Changes to the current web/mobile layout should be treated as explicit product changes, not cleanup.
