import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, Clock3, MapPin, AlertTriangle, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/crew-server'
import { ManagerOnly } from '@/components/auth/manager-only'
import { AssignedEventOnly } from '@/components/auth/assigned-event-only'
import { getCurrentUser } from '@/lib/actions/auth'
import { ResponsibleLivePersonnel, type ResponsibleLivePerson } from '@/components/responsible/responsible-live-personnel'

export const dynamic = 'force-dynamic'

function Card({ href, icon: Icon, title, value }: { href: string; icon: typeof CalendarDays; title: string; value: number }) {
  return <Link href={href} className="rounded-2xl border border-border bg-card p-5">
    <div className="flex items-center justify-between"><Icon className="h-5 w-5 text-violet-400"/><ArrowRight className="h-4 w-4 text-muted-foreground"/></div>
    <div className="mt-5 text-3xl font-black">{value}</div>
    <div className="text-sm text-muted-foreground">{title}</div>
  </Link>
}

export default async function Dashboard() {
  const s = await createClient()
  const current = await getCurrentUser()
  if (!current) return null
  if (current.isAdmin) redirect('/admin')
  const user = { id: current.id }

  const now = new Date().toISOString()
  const [profileResult, eventsResult, shiftsResult, incidentsResult, membershipsResult, activeEventsResult, openEventsResult] = await Promise.all([
    s.from('profiles').select('full_name,approved,role').eq('id', user.id).single(),
    s.from('events').select('id,name,venue,start_at,end_at,status').gte('end_at', now).order('start_at', { ascending: true }),
    s.from('shifts').select('id,scheduled_start,scheduled_end,role_name,workplace_id,event_id').eq('user_id', user.id).order('scheduled_start', { ascending: true }),
    s.from('incidents').select('id,event_id').neq('status', 'resolved'),
    s.from('event_members').select('event_id,event_role').eq('user_id', user.id),
    s.from('events').select('id').lte('start_at', now).gte('end_at', now),
    s.from('events').select('id').gte('end_at', now),
  ])

  const profile = profileResult.data
  if (profile && !profile.approved) {
    return <div className="p-8"><div className="mx-auto mt-20 max-w-xl rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center"><h1 className="text-2xl font-black">ACCOUNT NOG NIET GOEDGEKEURD</h1><p className="mt-2 text-muted-foreground">Je account wacht op goedkeuring door een beheerder.</p></div></div>
  }

  const events = eventsResult.data || []
  const shifts = shiftsResult.data || []
  const memberships = membershipsResult.data || []
  const activeEventIds = new Set((activeEventsResult.data || []).map(event => event.id))
  const openEventIds = new Set((openEventsResult.data || []).map(event => event.id))
  const hasEventAssignment = memberships.some(member => openEventIds.has(member.event_id))
  const hasActiveIncidentContext = current.role === 'admin'
    ? activeEventIds.size > 0
    : current.role === 'responsible_lead'
      && memberships.some(member => ['responsible_lead','admin'].includes(member.event_role) && activeEventIds.has(member.event_id))
  const activeIncidentCount = (incidentsResult.data || []).filter(incident =>
    Boolean(incident.event_id && activeEventIds.has(incident.event_id))
  ).length

  let responsibleLivePeople:ResponsibleLivePerson[]=[]
  let responsibleLiveError=false

  if(current.role==='responsible_lead'){
    const assignmentsResult=await s.from('responsible_assignments')
      .select('event_id,workplace_id')
      .eq('user_id',current.id)
    responsibleLiveError=Boolean(assignmentsResult.error)

    const activeAssignments=(assignmentsResult.data||[]).filter(assignment=>activeEventIds.has(assignment.event_id))
    if(activeAssignments.length){
      const workplaceIds=[...new Set(activeAssignments.map(assignment=>assignment.workplace_id))]
      const eventIds=[...new Set(activeAssignments.map(assignment=>assignment.event_id))]
      const allowedPairs=new Set(activeAssignments.map(assignment=>`${assignment.event_id}:${assignment.workplace_id}`))

      const directoryResults=await Promise.all(activeAssignments.map(assignment=>
        s.rpc('upt_responsible_crew_directory',{event_uuid:assignment.event_id,workplace_uuid:assignment.workplace_id})
      ))
      if(directoryResults.some(result=>result.error))responsibleLiveError=true

      const crewById=new Map<string,string>()
      for(const result of directoryResults){
        for(const member of result.data||[]){
          if(member.id!==current.id)crewById.set(member.id,member.full_name||'Personeelslid')
        }
      }

      const crewIds=[...crewById.keys()]
      if(crewIds.length){
        const [liveShiftsResult,workplacesResult]=await Promise.all([
          s.from('shifts')
            .select('id,user_id,event_id,workplace_id,status')
            .in('user_id',crewIds)
            .in('event_id',eventIds)
            .in('workplace_id',workplaceIds)
            .neq('status','cancelled'),
          s.from('workplaces').select('id,name').in('id',workplaceIds),
        ])
        if(liveShiftsResult.error||workplacesResult.error)responsibleLiveError=true

        const liveShifts=(liveShiftsResult.data||[]).filter(shift=>allowedPairs.has(`${shift.event_id}:${shift.workplace_id}`))
        const shiftIds=liveShifts.map(shift=>shift.id)
        if(shiftIds.length){
          const sessionsResult=await s.from('work_sessions')
            .select('id,user_id,shift_id,started_at')
            .in('shift_id',shiftIds)
            .is('ended_at',null)
            .order('started_at')
          if(sessionsResult.error)responsibleLiveError=true

          const sessions=sessionsResult.data||[]
          const sessionIds=sessions.map(session=>session.id)
          const breaksResult=sessionIds.length
            ? await s.from('break_sessions')
                .select('work_session_id,started_at,ended_at')
                .in('work_session_id',sessionIds)
                .order('started_at')
            : {data:[],error:null}
          if(breaksResult.error)responsibleLiveError=true

          const shiftById=new Map(liveShifts.map(shift=>[shift.id,shift]))
          const workplaceById=new Map((workplacesResult.data||[]).map(workplace=>[workplace.id,workplace.name]))
          responsibleLivePeople=sessions.flatMap(session=>{
            const shift=session.shift_id?shiftById.get(session.shift_id):undefined
            if(!shift)return []
            return [{
              sessionId:session.id,
              name:crewById.get(session.user_id)||'Personeelslid',
              workplaceId:shift.workplace_id,
              workplaceName:workplaceById.get(shift.workplace_id)||'Werkplek',
              startedAt:session.started_at,
              breaks:(breaksResult.data||[])
                .filter(item=>item.work_session_id===session.id)
                .map(item=>({startedAt:item.started_at,endedAt:item.ended_at})),
            }]
          })
        }
      }
    }
  }

  const hasLoadError = Boolean(
    profileResult.error || eventsResult.error || shiftsResult.error || incidentsResult.error
    || membershipsResult.error || activeEventsResult.error || openEventsResult.error
    || responsibleLiveError
  )

  return <main className="space-y-7 p-4 md:p-8">
    <div>
      <p className="text-xs font-bold tracking-[.2em] text-violet-400">UP TILL DAWN PERSONEELSBEHEER</p>
      <h1 className="mt-1 text-3xl font-black">Welkom, {profile?.full_name || 'Personeelslid'}</h1>
      <p className="text-muted-foreground">Je operationele personeelsoverzicht.</p>
    </div>
    {hasLoadError && <p className="rounded-xl border border-amber-500/40 p-4">Een deel van het overzicht kon niet worden geladen.</p>}
    <section className="grid gap-4 md:grid-cols-3">
      <Card href="/events" icon={CalendarDays} title="Evenementen" value={events.length}/>
      <AssignedEventOnly available={hasEventAssignment}><Card href="/shifts" icon={Clock3} title="Mijn diensten" value={shifts.length}/></AssignedEventOnly>
      {hasActiveIncidentContext && <ManagerOnly><Card href="/incidents" icon={AlertTriangle} title="Open incidenten" value={activeIncidentCount}/></ManagerOnly>}
    </section>
    {current.role==='responsible_lead'&&<section className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Personeel van mijn werkplek</h2>
          <p className="text-sm text-muted-foreground">Live status en lopende werk- of pauzetimer.</p>
        </div>
        <span className="text-sm text-muted-foreground">{responsibleLivePeople.length} actief</span>
      </div>
      <ResponsibleLivePersonnel people={responsibleLivePeople}/>
    </section>}
    <section>
      <h2 className="mb-3 text-lg font-bold">Komende evenementen</h2>
      <div className="grid gap-3">
        {events.length ? events.slice(0, 3).map(event => <Link href="/events" key={event.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4"><div><div className="font-bold">{event.name}</div><div className="flex gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4"/>{event.venue || 'Locatie nog niet ingesteld'}</div></div><ArrowRight className="h-5 w-5"/></Link>) : <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">Geen evenementen beschikbaar.</div>}
      </div>
    </section>
  </main>
}
