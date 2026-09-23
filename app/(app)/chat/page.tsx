import { createClient } from '@/lib/supabase/crew-server'
import { ChatClient } from '@/components/crew/chat-client'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return null

  const [
    { data: channels, error },
    { data: directory },
    { data: privatePeers },
    { data: profile },
    { data: shifts },
    { data: responsibleAssignments },
    { data: events },
  ] = await Promise.all([
    s.from('chat_channels').select('*').order('created_at'),
    s.rpc('upt_crew_directory'),
    s.rpc('upt_private_chat_peers'),
    s.from('profiles').select('role').eq('id', user.id).single(),
    s.from('shifts')
      .select('event_id,workplace_id,scheduled_start,scheduled_end,status')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .order('scheduled_start'),
    s.from('responsible_assignments')
      .select('event_id,workplace_id')
      .eq('user_id', user.id),
    s.from('events')
      .select('id,start_at,end_at')
      .order('start_at'),
  ])

  const profilePhotoUrls: Record<string, string> = {}
  await Promise.all((directory || []).filter(member => member.profile_photo_url).map(async member => {
    const { data: signed } = await s.storage.from('profile-photos').createSignedUrl(member.profile_photo_url!, 3600)
    if (signed?.signedUrl) profilePhotoUrls[member.id] = signed.signedUrl
  }))

  const orderedChannels = [...(channels || [])].sort((a, b) => {
    const weight = (kind: string) => kind === 'organization' ? 0 : kind === 'workplace' ? 1 : kind === 'event' ? 2 : 3
    const byKind = weight(a.kind) - weight(b.kind)
    if (byKind) return byKind
    return (a.name || '').localeCompare(b.name || '', 'nl')
  })

  const now = Date.now()
  const activeEventIds = new Set((events || [])
    .filter(event => new Date(event.start_at).getTime() <= now && now <= new Date(event.end_at).getTime())
    .map(event => event.id))

  const activeShifts = (shifts || []).filter(shift => activeEventIds.has(shift.event_id))
  const currentShift = activeShifts.find(shift =>
    new Date(shift.scheduled_start).getTime() <= now && now <= new Date(shift.scheduled_end).getTime(),
  ) || activeShifts[0]

  const currentResponsible = !currentShift
    ? (responsibleAssignments || []).find(assignment => activeEventIds.has(assignment.event_id))
    : undefined

  const workplaceContext = currentShift || currentResponsible
  const activeEventId = workplaceContext?.event_id || [...activeEventIds][0]

  const defaultChannelId =
    (workplaceContext
      ? orderedChannels.find(channel =>
          channel.kind === 'workplace'
          && channel.event_id === workplaceContext.event_id
          && channel.workplace_id === workplaceContext.workplace_id,
        )?.id
      : undefined)
    || (activeEventId
      ? orderedChannels.find(channel => channel.kind === 'event' && channel.event_id === activeEventId)?.id
      : undefined)
    || orderedChannels.find(channel => channel.kind === 'organization')?.id
    || orderedChannels[0]?.id
    || ''

  return <main className="mx-auto max-w-4xl p-0 pb-24 md:p-8 md:pb-8">
    {error
      ? <p className="p-4">Chat kon niet worden geladen.</p>
      : <ChatClient
          channels={orderedChannels}
          defaultChannelId={defaultChannelId}
          userId={user.id}
          crewDirectory={directory || []}
          privatePeers={privatePeers || []}
          isAdmin={profile?.role === 'admin'}
          profilePhotoUrls={profilePhotoUrls}
        />}
  </main>
}
