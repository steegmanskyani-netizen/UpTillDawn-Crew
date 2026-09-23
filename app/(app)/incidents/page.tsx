import { createClient } from '@/lib/supabase/crew-server'
import { IncidentForm } from '@/components/crew/incident-form'
import { IncidentControls } from '@/components/crew/incident-controls'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return null

  const [{ data: events }, { data: profile }, { data, error }] = await Promise.all([
    s.from('events').select('id,name').neq('status', 'archived'),
    s.from('profiles').select('role').eq('id', user.id).single(),
    s.from('incidents').select('id,message,status,created_at,acknowledged_at,resolved_at,event_id,workplace_id,photo_path').order('created_at', { ascending: false }).limit(100),
  ])
  const manager = profile?.role === 'admin' || profile?.role === 'responsible_lead'
  const signedPhotos = new Map<string,string>()
  await Promise.all((data || []).filter(i => i.photo_path).map(async i => {
    const { data: signed } = await s.storage.from('incident-photos').createSignedUrl(i.photo_path!, 300)
    if (signed?.signedUrl) signedPhotos.set(i.id, signed.signedUrl)
  }))

  return <main className="mx-auto max-w-4xl space-y-5 p-4 pb-28 md:p-8">
    <h1 className="text-3xl font-black">Incidenten</h1>
    <IncidentForm userId={user.id} events={events || []}/>
    {error ? <p>Meldingen konden niet worden geladen.</p> : data?.map(i =>
      <article key={i.id} className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="whitespace-pre-wrap">{i.message}</p>
          <span className="rounded-full border px-2 py-1 text-xs font-bold">{i.status}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{new Date(i.created_at).toLocaleString('nl-BE')}</p>
        {i.acknowledged_at && <p className="text-sm text-muted-foreground">Erkend: {new Date(i.acknowledged_at).toLocaleString('nl-BE')}</p>}
        {i.resolved_at && <p className="text-sm text-muted-foreground">Opgelost: {new Date(i.resolved_at).toLocaleString('nl-BE')}</p>}
        {i.photo_path && <IncidentPhoto url={signedPhotos.get(i.id)}/>}
        {manager && <IncidentControls id={i.id} status={i.status} resolved={Boolean(i.resolved_at)}/>}
      </article>
    )}
  </main>
}

function IncidentPhoto({ url }: { url?: string }) {
  if (!url) return <span className="mt-2 block text-sm text-muted-foreground">Incidentfoto niet beschikbaar.</span>
  return <a href={url} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-xl border">
    {/* Signed private-storage URL; opening the original is intentionally short-lived. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt="Incidentfoto" className="max-h-80 w-full object-contain bg-black/20"/>
  </a>
}
