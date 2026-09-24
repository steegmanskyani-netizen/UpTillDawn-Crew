import { createClient } from '@/lib/supabase/crew-server'
import { redirect } from 'next/navigation'
import OperationsClient from './operations-client'
import type { Tables } from '@/types/crew-database'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date().toISOString()
  const [{ data: profile }, { data: activeEvents, error: eventError }] = await Promise.all([
    s.from('profiles').select('role').eq('id', user.id).single(),
    s.from('events')
      .select('*')
      .lte('start_at', now)
      .gte('end_at', now)
      .neq('status', 'archived')
      .order('start_at'),
  ])

  const manager = profile?.role === 'admin' || profile?.role === 'responsible_lead'
  const activeEventIds = (activeEvents || []).map(event => event.id)

  if (eventError) {
    return <main className="p-8">Werkgegevens konden niet worden geladen. Probeer opnieuw.</main>
  }
  if (!activeEventIds.length) {
    if (profile?.role !== 'admin') redirect('/events')
    return <main className="p-8">
      Werk &amp; pauze is beschikbaar vanaf de start van een toegewezen evenement.
    </main>
  }

  const shiftsQuery = s.from('shifts')
    .select('*')
    .eq('user_id', user.id)
    .in('event_id', activeEventIds)
    .neq('status', 'cancelled')
    .order('scheduled_start')

  const [
    shifts,
    workplaces,
    session,
    pause,
    checkins,
    checkouts,
  ] = await Promise.all([
    shiftsQuery,
    s.from('workplaces').select('*').in('event_id', activeEventIds),
    s.from('work_sessions').select('*').eq('user_id', user.id).in('event_id', activeEventIds).is('ended_at', null).maybeSingle(),
    s.from('break_sessions').select('*').eq('user_id', user.id).is('ended_at', null).maybeSingle(),
    s.from('check_ins').select('*').in('event_id', activeEventIds).order('requested_at', { ascending: false }).limit(100),
    s.from('check_outs').select('*').in('event_id', activeEventIds).order('requested_at', { ascending: false }).limit(100),
  ])

  if ([shifts, workplaces, session, pause, checkins, checkouts].some(query => query.error)) {
    return <main className="p-8">Werkgegevens konden niet worden geladen. Probeer opnieuw.</main>
  }

  if (!manager && !shifts.data?.length) {
    return <main className="p-8">
      Werk &amp; pauze is alleen beschikbaar voor je toegewezen dienst tijdens een lopend evenement.
    </main>
  }

  const summary = session.data
    ? await s.rpc('upt_work_session_time_summary', { p_work_session: session.data.id })
    : null

  let liveSessions: Tables<'work_sessions'>[] = []
  let liveBreaks: Tables<'break_sessions'>[] = []
  let liveShifts: Tables<'shifts'>[] = []
  let crewDirectory: Array<{ id: string; full_name: string | null; phone_number: string | null; profile_photo_url: string | null }> = []

  if (manager) {
    const [sessionsResult, breaksResult, assignmentsResult, liveShiftsResult] = await Promise.all([
      s.from('work_sessions').select('*').in('event_id', activeEventIds).is('ended_at', null).order('started_at'),
      s.from('break_sessions').select('*').is('ended_at', null).order('started_at'),
      s.from('responsible_assignments').select('event_id,workplace_id').eq('user_id', user.id).in('event_id', activeEventIds),
      s.from('shifts').select('*').in('event_id', activeEventIds).neq('status', 'cancelled'),
    ])

    liveSessions = sessionsResult.data || []
    liveBreaks = breaksResult.data || []
    liveShifts = liveShiftsResult.data || []

    if (profile?.role === 'admin') {
      const { data } = await s.from('profiles').select('id,full_name,phone_number,profile_photo_url').eq('approved', true)
      crewDirectory = data || []
    } else {
      const rows = await Promise.all((assignmentsResult.data || []).map(assignment =>
        s.rpc('upt_responsible_crew_directory', {
          event_uuid: assignment.event_id,
          workplace_uuid: assignment.workplace_id,
        }),
      ))
      const unique = new Map<string, (typeof crewDirectory)[number]>()
      for (const row of rows) {
        for (const member of row.data || []) unique.set(member.id, member)
      }
      crewDirectory = [...unique.values()]
    }
  }

  return <OperationsClient
    userId={user.id}
    shifts={shifts.data || []}
    events={activeEvents || []}
    workplaces={workplaces.data || []}
    activeSession={session.data}
    activeBreak={pause.data}
    checkins={checkins.data || []}
    checkouts={checkouts.data || []}
    manager={manager}
    summary={summary?.data?.[0] || null}
    liveSessions={liveSessions}
    liveBreaks={liveBreaks}
    liveShifts={liveShifts}
    crewDirectory={crewDirectory}
  />
}
