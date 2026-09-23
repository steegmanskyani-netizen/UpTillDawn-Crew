import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-server'
import { TimeCorrectionForm } from '@/components/crew/time-correction-form'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await s.from('profiles').select('approved,role').eq('id', user.id).single()
  if (!profile?.approved || profile.role !== 'admin') redirect('/')

  const [{ data: sessions, error }, { data: breaks }, { data: people }, { data: events }, { data: corrections }] = await Promise.all([
    s.from('work_sessions').select('*').order('started_at', { ascending: false }).limit(100),
    s.from('break_sessions').select('*').order('started_at', { ascending: false }).limit(200),
    s.from('profiles').select('id,full_name'),
    s.from('events').select('id,name'),
    s.from('time_corrections').select('*').order('corrected_at', { ascending: false }).limit(100),
  ])
  if (error) return <main className="p-8">Tijdregistraties konden niet worden geladen.</main>
  const name = (id: string) => people?.find(p => p.id === id)?.full_name || 'Crewlid'
  const eventName = (id: string) => events?.find(e => e.id === id)?.name || 'Event'

  return <main className="mx-auto max-w-6xl space-y-6 p-4 pb-28 md:p-8">
    <div><h1 className="text-3xl font-black">Tijdcorrecties</h1><p className="text-muted-foreground">Alle correcties vereisen een reden en blijven bewaard in de auditgeschiedenis.</p></div>
    <section className="space-y-4">
      {(sessions || []).map(session => <article key={session.id} className="rounded-2xl border p-4">
        <h2 className="font-bold">{name(session.user_id)} · {eventName(session.event_id)}</h2>
        <TimeCorrectionForm targetType="work_session" targetId={session.id} startedAt={session.started_at} endedAt={session.ended_at}/>
        {(breaks || []).filter(b => b.work_session_id === session.id).map(b => <div key={b.id} className="ml-4 mt-3"><p className="text-sm font-semibold">Pauze</p><TimeCorrectionForm targetType="break_session" targetId={b.id} startedAt={b.started_at} endedAt={b.ended_at}/></div>)}
      </article>)}
    </section>
    <section className="space-y-2"><h2 className="text-xl font-bold">Recente correctiegeschiedenis</h2>
      {(corrections || []).map(c => <article key={c.id} className="rounded-xl border p-3 text-sm"><p className="font-semibold">{name(c.user_id)} · {c.field_name}</p><p>{new Date(c.original_value).toLocaleString('nl-BE')} → {new Date(c.corrected_value).toLocaleString('nl-BE')}</p><p className="text-muted-foreground">{c.reason} · {new Date(c.corrected_at).toLocaleString('nl-BE')}</p></article>)}
    </section>
  </main>
}
