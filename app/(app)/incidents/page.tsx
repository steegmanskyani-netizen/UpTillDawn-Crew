import { createClient } from '@/lib/supabase/crew-server'
import { IncidentForm } from '@/components/crew/incident-form'
import { IncidentControls } from '@/components/crew/incident-controls'
import { nlStatus } from '@/lib/ui-nl'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return null

  const [
    { data: events },
    { data: profile },
    { data: incidents, error },
    { data: shifts },
    { data: activeSession },
  ] = await Promise.all([
    s.from('events')
      .select('id,name')
      .lte('start_at', 'now')
      .gte('end_at', 'now')
      .neq('status', 'archived'),
    s.from('profiles').select('role').eq('id', user.id).single(),
    s.from('incidents')
      .select('id,message,status,created_at,acknowledged_at,resolved_at,event_id,workplace_id,photo_path')
      .order('created_at', { ascending: false })
      .limit(100),
    s.from('shifts')
      .select('id,event_id,workplace_id,events(name),workplaces(name)')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .order('scheduled_start'),
    s.from('work_sessions')
      .select('event_id,shift_id')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .maybeSingle(),
  ])

  const manager = profile?.role === 'admin' || profile?.role === 'responsible_lead'
  const activeEventIds = new Set((events || []).map(event => event.id))
  const visibleIncidents = (incidents || []).filter(incident => Boolean(incident.event_id && activeEventIds.has(incident.event_id)))
  const activeShifts = (shifts || []).filter(shift => activeEventIds.has(shift.event_id))
  const activeShift = activeShifts.find(shift => shift.id === activeSession?.shift_id)
  const contexts = activeShifts.map(shift => ({
    event_id: shift.event_id,
    workplace_id: shift.workplace_id,
    event_name: shift.events?.name || 'Evenement',
    workplace_name: shift.workplaces?.name || 'Werkplek',
  }))

  const signedPhotos = new Map<string,string>()
  if (manager) {
    await Promise.all(visibleIncidents.filter(i => i.photo_path).map(async i => {
      const { data: signed } = await s.storage.from('incident-photos').createSignedUrl(i.photo_path!, 300)
      if (signed?.signedUrl) signedPhotos.set(i.id, signed.signedUrl)
    }))
  }

  if (!(events || []).length) {
    if (profile?.role !== 'admin') redirect('/events')
    return <main className="mx-auto max-w-4xl p-4 md:p-8">
      <p className="rounded-xl border p-4 text-muted-foreground">Incidenten zijn beschikbaar vanaf de start van een lopend evenement.</p>
    </main>
  }

  return <main className="mx-auto max-w-4xl space-y-5 p-4 pb-28 md:p-8">
    <h1 className="text-3xl font-black">{manager ? 'Incidenten' : 'Urgent melden'}</h1>

    <IncidentForm
      userId={user.id}
      events={events || []}
      contexts={contexts}
      defaultEventId={activeSession?.event_id || events?.[0]?.id}
      defaultWorkplaceId={activeShift?.workplace_id}
    />

    {manager && <>
      <h2 className="text-xl font-bold">Open incidenten</h2>
      {error
        ? <p>Meldingen konden niet worden geladen.</p>
        : !visibleIncidents.length
          ? <p className="text-muted-foreground">Geen incidenten.</p>
          : visibleIncidents.map(i => <article key={i.id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="whitespace-pre-wrap">{i.message}</p>
                <span className="rounded-full border px-2 py-1 text-xs font-bold">{nlStatus(i.status)}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{new Date(i.created_at).toLocaleString('nl-BE')}</p>
              {i.acknowledged_at && <p className="text-sm text-muted-foreground">Erkend: {new Date(i.acknowledged_at).toLocaleString('nl-BE')}</p>}
              {i.resolved_at && <p className="text-sm text-muted-foreground">Opgelost: {new Date(i.resolved_at).toLocaleString('nl-BE')}</p>}
              {i.photo_path && <IncidentPhoto url={signedPhotos.get(i.id)}/>}
              <IncidentControls id={i.id} status={i.status} resolved={Boolean(i.resolved_at)}/>
            </article>)}
    </>}
  </main>
}

function IncidentPhoto({ url }: { url?: string }) {
  if (!url) return <span className="mt-2 block text-sm text-muted-foreground">Incidentfoto niet beschikbaar.</span>
  return <a href={url} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-xl border">
    {/* Ondertekende privéopslag-URL; de originele koppeling is bewust kort geldig. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt="Incidentfoto" className="max-h-80 w-full object-contain bg-black/20"/>
  </a>
}
