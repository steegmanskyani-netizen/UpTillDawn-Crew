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
  ] = await Promise.all([
    s.from('chat_channels').select('*').order('created_at'),
    s.rpc('upt_crew_directory'),
    s.rpc('upt_private_chat_peers'),
    s.from('profiles').select('role').eq('id', user.id).single(),
  ])

  const profilePhotoUrls: Record<string, string> = {}
  await Promise.all((directory || []).filter(member => member.profile_photo_url).map(async member => {
    const { data: signed } = await s.storage.from('profile-photos').createSignedUrl(member.profile_photo_url!, 3600)
    if (signed?.signedUrl) profilePhotoUrls[member.id] = signed.signedUrl
  }))

  return <main className="mx-auto max-w-4xl space-y-4 p-4 pb-28 md:p-8">
    <h1 className="text-3xl font-black">Chat</h1>
    {error
      ? <p>Chat kon niet worden geladen.</p>
      : <ChatClient
          channels={channels || []}
          userId={user.id}
          crewDirectory={directory || []}
          privatePeers={privatePeers || []}
          isAdmin={profile?.role === 'admin'}
          profilePhotoUrls={profilePhotoUrls}
        />}
  </main>
}
