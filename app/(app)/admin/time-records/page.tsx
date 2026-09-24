import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-server'
import { TimeCorrectionForm } from '@/components/crew/time-correction-form'
import { getCurrentUser } from '@/lib/actions/auth'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const s = await createClient()
  const current = await getCurrentUser()
  if (!current) redirect('/login')
  if (!current.isAdmin) redirect('/')
  const user = { id: current.id }

  const { data: sessions, error: sessionsError } = await s
    .from('work_sessions')
    .select('id,user_id,event_id,started_at,ended_at')
    .order('started_at', { ascending: false })
    .limit(100)

  if (sessionsError) {
    return <main className="p-8">Tijdregistraties konden niet worden geladen.</main>
  }

  const sessionIds = (sessions || []).map(session => session.id)
  const breaksPromise = sessionIds.length
    ? s.from('break_sessions')
        .select('id,work_session_id,user_id,started_at,ended_at')
        .in('work_session_id', sessionIds)
        .order('started_at', { ascending: false })
    : Promise.resolve({ data: [], error: null })

  const [
    { data: breaks, error: breaksError },
    { data: people, error: peopleError },
    { data: events, error: eventsError },
    { data: corrections, error: correctionsError },
  ] = await Promise.all([
    breaksPromise,
    s.from('profiles').select('id,full_name'),
    s.from('events').select('id,name'),
    s.from('time_corrections')
      .select('id,user_id,field_name,original_value,corrected_value,reason,corrected_at')
      .order('corrected_at', { ascending: false })
      .limit(100),
  ])

  if (breaksError || peopleError || eventsError || correctionsError) {
    return <main className="p-8">Tijdregistraties konden niet volledig worden geladen.</main>
  }

  const name = (id: string) => people?.find(person => person.id === id)?.full_name || 'Personeelslid'
  const fieldName = (value: string) => value === 'started_at' ? 'Starttijd' : value === 'ended_at' ? 'Eindtijd' : value
  const eventName = (id: string) => events?.find(event => event.id === id)?.name || 'Evenement'

  return <main className="mx-auto max-w-6xl space-y-6 p-4 pb-28 md:p-8">
    <div>
      <h1 className="text-3xl font-black">Tijdcorrecties</h1>
      <p className="text-muted-foreground">Alle correcties vereisen een reden en blijven bewaard in de auditgeschiedenis.</p>
    </div>

    <section className="space-y-4">
      {(sessions || []).map(session => <article key={session.id} className="rounded-2xl border p-4">
        <h2 className="font-bold">{name(session.user_id)} · {eventName(session.event_id)}</h2>
        <TimeCorrectionForm targetType="work_session" targetId={session.id} startedAt={session.started_at} endedAt={session.ended_at}/>
        {(breaks || []).filter(pause => pause.work_session_id === session.id).map(pause => <div key={pause.id} className="ml-4 mt-3">
          <p className="text-sm font-semibold">Pauze</p>
          <TimeCorrectionForm targetType="break_session" targetId={pause.id} startedAt={pause.started_at} endedAt={pause.ended_at}/>
        </div>)}
      </article>)}
      {!sessions?.length && <p className="rounded-xl border p-4 text-muted-foreground">Nog geen tijdregistraties.</p>}
    </section>

    <section className="space-y-2">
      <h2 className="text-xl font-bold">Recente correctiegeschiedenis</h2>
      {(corrections || []).map(correction => <article key={correction.id} className="rounded-xl border p-3 text-sm">
        <p className="font-semibold">{name(correction.user_id)} · {fieldName(correction.field_name)}</p>
        <p>{new Date(correction.original_value).toLocaleString('nl-BE')} → {new Date(correction.corrected_value).toLocaleString('nl-BE')}</p>
        <p className="text-muted-foreground">{correction.reason} · {new Date(correction.corrected_at).toLocaleString('nl-BE')}</p>
      </article>)}
    </section>
  </main>
}
