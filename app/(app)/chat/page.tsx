import { createClient } from '@/lib/supabase/crew-server'
import { ChatClient } from '@/components/crew/chat-client'
import { getCurrentUser } from '@/lib/actions/auth'

export const dynamic='force-dynamic'

export default async function Page(){
  const s=await createClient()
  const current=await getCurrentUser()
  if(!current)return null
  const user={id:current.id}

  const [
    {data:channels,error},
    {data:directory},
    {data:activeEvents},
    {data:memberships},
    {data:ownShifts},
    {data:responsibleAssignments},
    {data:chatEvents},
  ]=await Promise.all([
    s.from('chat_channels').select('*').in('kind',['organization','event','workplace']).order('created_at'),
    s.rpc('upt_crew_directory'),
    s.from('events').select('id,start_at,end_at').lte('start_at','now').gte('end_at','now').order('start_at'),
    s.from('event_members').select('event_id').eq('user_id',user.id),
    s.from('shifts').select('event_id,workplace_id').eq('user_id',user.id).neq('status','cancelled'),
    s.from('responsible_assignments').select('event_id,workplace_id').eq('user_id',user.id),
    s.from('events').select('id,start_at,end_at,status').neq('status','archived').order('start_at'),
  ])

  const profilePhotoUrls:Record<string,string>={}
  await Promise.all((directory||[]).filter(member=>member.profile_photo_url).map(async member=>{
    const {data:signed}=await s.storage.from('profile-photos').createSignedUrl(member.profile_photo_url!,3600)
    if(signed?.signedUrl)profilePhotoUrls[member.id]=signed.signedUrl
  }))

  const now=Date.now()
  const memberEventIds=new Set((memberships||[]).map(row=>row.event_id))
  const workplaceIds=new Set([
    ...(ownShifts||[]).map(row=>row.workplace_id),
    ...(responsibleAssignments||[]).map(row=>row.workplace_id),
  ])
  const chatWindowEventIds=new Set((chatEvents||[])
    .filter(event=>{
      const start=Date.parse(event.start_at)
      const end=Date.parse(event.end_at)+3*24*60*60*1000
      return start<=now&&now<=end
    })
    .map(event=>event.id))
  const readable=(channels||[]).filter(channel=>{
    if(!['organization','event','workplace'].includes(channel.kind))return false
    if(current.role==='admin')return true
    if(channel.kind==='organization')return true
    if(!channel.event_id||!chatWindowEventIds.has(channel.event_id))return false
    if(channel.kind==='event')return memberEventIds.has(channel.event_id)
    return Boolean(channel.workplace_id&&workplaceIds.has(channel.workplace_id))
  })
  const ordered=[...readable].sort((a,b)=>{
    const weight=(kind:string)=>kind==='organization'?0:kind==='event'?1:2
    const byKind=weight(a.kind)-weight(b.kind)
    if(byKind)return byKind
    return (a.name||'').localeCompare(b.name||'','nl')
  })
  const activeIds=new Set((activeEvents||[]).map(event=>event.id))
  const defaultChannelId=
    ordered.find(channel=>channel.kind==='event'&&channel.event_id&&activeIds.has(channel.event_id))?.id
    ||ordered.find(channel=>channel.kind==='organization')?.id
    ||ordered[0]?.id
    ||''

  return <main className="mx-auto max-w-4xl p-0 pb-24 md:p-8 md:pb-8">
    {error
      ? <p className="p-4">Gesprekken konden niet worden geladen.</p>
      : <ChatClient
          channels={ordered}
          defaultChannelId={defaultChannelId}
          userId={user.id}
          crewDirectory={directory||[]}
          isAdmin={current.role==='admin'}
          profilePhotoUrls={profilePhotoUrls}
        />}
  </main>
}
