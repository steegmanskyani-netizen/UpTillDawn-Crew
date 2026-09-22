import { createClient } from '@/lib/supabase/crew-server'
import { ChatClient } from '@/components/crew/chat-client'
export const dynamic='force-dynamic'
export default async function Page(){const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)return null;const {data,error}=await s.from('chat_channels').select('*');return <main className="mx-auto max-w-4xl space-y-4 p-4 pb-28 md:p-8"><h1 className="text-3xl font-black">Chat</h1>{error?<p>Chat kon niet worden geladen.</p>:<ChatClient channels={data||[]} userId={user.id}/>}</main>}
