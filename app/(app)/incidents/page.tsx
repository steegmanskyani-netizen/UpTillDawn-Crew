import { createClient } from '@/lib/supabase/crew-server'
import { IncidentForm } from '@/components/crew/incident-form'
import { IncidentControls } from '@/components/crew/incident-controls'
import { nlStatus } from '@/lib/ui-nl'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/actions/auth'

export const dynamic='force-dynamic'

function isVideo(path:string|null){
  return Boolean(path&&/\.(mp4|webm|mov)(?:$|\?)/i.test(path))
}

export default async function Page(){
  const s=await createClient()
  const current=await getCurrentUser()
  if(!current)return null
  const user={id:current.id}
  const now=new Date().toISOString()

  const [
    {data:events},
    {data:incidents,error},
    {data:shifts},
    {data:activeSession},
  ]=await Promise.all([
    s.from('events').select('id,name').lte('start_at',now).gte('end_at',now).neq('status','archived'),
    s.from('incidents').select('id,user_id,reporter_id,message,status,created_at,acknowledged_at,resolved_at,event_id,workplace_id,photo_path').order('created_at',{ascending:false}).limit(100),
    s.from('shifts').select('id,event_id,workplace_id,scheduled_start,scheduled_end,events(name),workplaces(name)')
      .eq('user_id',user.id).neq('status','cancelled').lte('scheduled_start',now).gte('scheduled_end',now).order('scheduled_start'),
    s.from('work_sessions').select('event_id,shift_id').eq('user_id',user.id).is('ended_at',null).maybeSingle(),
  ])

  const isAdmin=current.role==='admin'
  const manager=isAdmin||current.role==='responsible_lead'
  const activeEventIds=new Set((events||[]).map(event=>event.id))
  const activeShifts=(shifts||[]).filter(shift=>activeEventIds.has(shift.event_id))

  if(!isAdmin&&!activeShifts.length)redirect('/events')
  if(!(events||[]).length){
    if(!isAdmin)redirect('/events')
    return <main className="mx-auto max-w-4xl p-4 md:p-8"><p className="rounded-xl border p-4 text-muted-foreground">Incidenten zijn beschikbaar vanaf de start van een lopend evenement.</p></main>
  }

  const visibleIncidents=(incidents||[]).filter(incident=>{
    if(!incident.event_id||!activeEventIds.has(incident.event_id))return false
    return isAdmin||manager||incident.reporter_id===user.id||incident.user_id===user.id
  })
  const activeShift=activeShifts.find(shift=>shift.id===activeSession?.shift_id)||activeShifts[0]
  const contexts=activeShifts.map(shift=>({
    event_id:shift.event_id,
    workplace_id:shift.workplace_id,
    event_name:shift.events?.name||'Evenement',
    workplace_name:shift.workplaces?.name||'Werkplek',
  }))

  const signedMedia=new Map<string,string>()
  await Promise.all(visibleIncidents.filter(i=>i.photo_path).map(async i=>{
    const {data:signed}=await s.storage.from('incident-photos').createSignedUrl(i.photo_path!,300)
    if(signed?.signedUrl)signedMedia.set(i.id,signed.signedUrl)
  }))

  return <main className="mx-auto max-w-4xl space-y-5 p-4 pb-28 md:p-8">
    <h1 className="text-3xl font-black">{manager?'Help':'Urgent melden'}</h1>
    {!isAdmin&&<IncidentForm
      userId={user.id}
      events={(events||[]).filter(event=>activeShifts.some(shift=>shift.event_id===event.id))}
      contexts={contexts}
      defaultEventId={activeShift?.event_id}
      defaultWorkplaceId={activeShift?.workplace_id}
    />}

    <h2 className="text-xl font-bold">{manager?'Open help oproepen':'Mijn help oproepen'}</h2>
    {error
      ? <p>Meldingen konden niet worden geladen.</p>
      : !visibleIncidents.length
        ? <p className="text-muted-foreground">Geen help oproepen.</p>
        : visibleIncidents.map(i=><article key={i.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="whitespace-pre-wrap">{i.message}</p>
              <span className="rounded-full border px-2 py-1 text-xs font-bold">{nlStatus(i.status)}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{new Date(i.created_at).toLocaleString('nl-BE')}</p>
            {i.acknowledged_at&&<p className="text-sm text-muted-foreground">Erkend: {new Date(i.acknowledged_at).toLocaleString('nl-BE')}</p>}
            {i.resolved_at&&<p className="text-sm text-muted-foreground">Opgelost: {new Date(i.resolved_at).toLocaleString('nl-BE')}</p>}
            {i.photo_path&&<IncidentMedia url={signedMedia.get(i.id)} video={isVideo(i.photo_path)}/>}
            {manager&&<IncidentControls id={i.id} status={i.status} resolved={Boolean(i.resolved_at)}/>}
          </article>)}
  </main>
}

function IncidentMedia({url,video}:{url?:string;video:boolean}){
  if(!url)return <span className="mt-2 block text-sm text-muted-foreground">Incidentmedia niet beschikbaar.</span>
  if(video)return <video src={url} controls playsInline className="mt-3 max-h-96 w-full rounded-xl border bg-black"/>
  return <a href={url} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-xl border">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt="Incidentfoto" className="max-h-80 w-full object-contain bg-black/20"/>
  </a>
}
