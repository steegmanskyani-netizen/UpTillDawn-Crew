# UPTILLDAWN Crew Management — Phase 1

Implemented in this conversion:

- Product/package rebrand to UPTILLDAWN Crew Management
- Focused desktop/mobile navigation
- New operational dashboard
- Core routes: Events, Workplaces, Shifts, Incidents
- `responsible_lead` role support
- Account approval state with `ACCOUNT NOT APPROVED` gate on dashboard
- Additive Supabase migration `026_uptilldawn_core.sql`
- Core event/workplace/member/responsible/shift/incident schema
- Initial RLS policies for admin, responsible lead and staff isolation

## Apply database migration
Run all existing migrations first, then `supabase/migrations/026_uptilldawn_core.sql`.

This is Phase 1, not the finished product. Check-in/out, time sessions, break allowance, transitions, briefings, tasks, chat, offline queue and Excel changes remain for later phases.
