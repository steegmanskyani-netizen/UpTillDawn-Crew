import { createClient } from '@/lib/supabase/crew-server'
import { redirect } from 'next/navigation'
import OperationsClient from './operations-client'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  if (!user) redirect('/login')

  const queries = await Promise.all([
    s.from('shifts').select('*').eq('user_id', user.id).neq('status', 'cancelled').order('scheduled_start'),
    s.from('events').select('*').neq('status', 'archived').order('start_at'),
    s.from('workplaces').select('*'),
    s.from('work_sessions').select('*').eq('user_id', user.id).is('ended_at', null).maybeSingle(),
    s.from('break_sessions').select('*').eq('user_id', user.id).is('ended_at', null).maybeSingle(),
    s.from('check_ins').select('*').order('requested_at', { ascending: false }).limit(100),
    s.from('check_outs').select('*').order('requested_at', { ascending: false }).limit(100),
    s.from('profiles').select('role').eq('id', user.id).single(),
  ])

  if (queries.some(q => q.error)) {
    return <main className="p-8">Werkgegevens konden niet worden geladen. Probeer opnieuw.</main>
  }

  const [shifts, events, workplaces, session, pause, checkins, checkouts, profile] = queries
  const manager = profile.data?.role !== 'staff'
  const summary = session.data
    ? await s.rpc('upt_work_session_time_summary', { p_work_session: session.data.id })
    : null

  let liveSessions: typeof shifts.data extends never ? never[] : any[] = []
  let liveBreaks: any[] = []
  let liveShifts: any[] = []
  let crewDirectory: Array<{ id: string; full_name: string | null; phone_number: string | null; profile_photo_url: string | null }> = []

  if (manager) {
    const [sessionsResult, breaksResult, assignmentsResult, liveShiftsResult] = await Promise.all([
      s.from('work_sessions').select('*').is('ended_at', null).order('started_at'),
      s.from('break_sessions').select('*').is('ended_at', null).order('started_at'),
      s.from('responsible_assignments').select('event_id,workplace_id').eq('user_id', user.id),
      s.from('shifts').select('*').neq('status', 'cancelled'),
    ])

    liveSessions = sessionsResult.data || []
    liveBreaks = breaksResult.data || []
    liveShifts = liveShiftsResult.data || []

    if (profile.data?.role === 'admin') {
      const { data } = await s.from('profiles').select('id,full_name,phone_number,profile_photo_url').eq('approved', true)
      crewDirectory = data || []
    } else {
      const rows = await Promise.all((assignmentsResult.data || []).map(a =>
        s.rpc('upt_responsible_crew_directory', { event_uuid: a.event_id, workplace_uuid: a.workplace_id })
      ))
      const unique = new Map<string, (typeof crewDirectory)[number]>()
      for (const row of rows) for (const member of row.data || []) unique.set(member.id, member)
      crewDirectory = [...unique.values()]
    }
  }

  return <OperationsClient
    userId={user.id}
    shifts={shifts.data || []}
    events={events.data || []}
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
