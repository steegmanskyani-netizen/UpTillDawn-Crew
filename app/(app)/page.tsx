import Link from 'next/link'
import { CalendarDays, Clock3, MapPin, AlertTriangle, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/crew-server'
import { ManagerOnly } from '@/components/auth/manager-only'
import { AssignedEventOnly } from '@/components/auth/assigned-event-only'

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
  const { data: { user } } = await s.auth.getUser()
  if (!user) return null

  const now = new Date().toISOString()
  const [profileResult, eventsResult, shiftsResult, incidentsResult, membershipsResult, activeEventsResult] = await Promise.all([
    s.from('profiles').select('full_name,approved,role').eq('id', user.id).single(),
    s.from('events').select('id,name,venue,start_at,end_at,status').gte('end_at', now).order('start_at', { ascending: true }).limit(3),
    s.from('shifts').select('id,scheduled_start,scheduled_end,role_name,workplace_id,event_id').eq('user_id', user.id).order('scheduled_start', { ascending: true }).limit(3),
    s.from('incidents').select('id', { count: 'exact', head: true }).neq('status', 'resolved'),
    s.from('event_members').select('event_id,event_role').eq('user_id', user.id),
    s.from('events').select('id').lte('start_at', now).gte('end_at', now),
  ])

  const profile = profileResult.data
  if (profile && !profile.approved) {
    return <div className="p-8"><div className="mx-auto mt-20 max-w-xl rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center"><h1 className="text-2xl font-black">ACCOUNT NOG NIET GOEDGEKEURD</h1><p className="mt-2 text-muted-foreground">Je account wacht op goedkeuring door een beheerder.</p></div></div>
  }

  const events = eventsResult.data || []
  const shifts = shiftsResult.data || []
  const memberships = membershipsResult.data || []
  const activeEventIds = new Set((activeEventsResult.data || []).map(event => event.id))
  const hasEventAssignment = memberships.length > 0
  const hasActiveIncidentContext = profile?.role === 'admin'
    ? activeEventIds.size > 0
    : memberships.some(member => member.event_role === 'responsible_lead' && activeEventIds.has(member.event_id))
  const hasLoadError = Boolean(
    profileResult.error || eventsResult.error || shiftsResult.error || incidentsResult.error
    || membershipsResult.error || activeEventsResult.error
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
      {hasActiveIncidentContext && <ManagerOnly><Card href="/incidents" icon={AlertTriangle} title="Open incidenten" value={incidentsResult.count ?? 0}/></ManagerOnly>}
    </section>
    <section>
      <h2 className="mb-3 text-lg font-bold">Komende evenementen</h2>
      <div className="grid gap-3">
        {events.length ? events.map(event => <Link href="/events" key={event.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4"><div><div className="font-bold">{event.name}</div><div className="flex gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4"/>{event.venue || 'Locatie nog niet ingesteld'}</div></div><ArrowRight className="h-5 w-5"/></Link>) : <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">Geen evenementen beschikbaar.</div>}
      </div>
    </section>
  </main>
}
