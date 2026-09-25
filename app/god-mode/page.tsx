import { cookies } from 'next/headers'
import Link from 'next/link'
import { godModeLogout } from '@/lib/actions/god-mode'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-server'
import { GodStudio } from '@/components/god-mode/god-studio'

export const dynamic='force-dynamic'

export default async function GodModePage(){
  const token=(await cookies()).get('uptilldawn-god-session')?.value
  if(!token)redirect('/god-mode/login')
  const s=await createClient()
  const {data:valid}=await s.rpc('upt_god_session_valid',{p_token:token})
  if(valid!==true)redirect('/god-mode/login')

  return <main className="min-h-screen bg-background p-4 pb-16 md:p-8">
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-500">God Mode</p>
        <h1 className="mt-1 text-3xl font-black">App Studio</h1>
        <p className="mt-2 text-sm text-muted-foreground">Programmeer de app, bewerk gegevens en beheer logica, workflows en versies.</p>
        <div className="mt-4 flex flex-wrap gap-2"><Link href="/" className="rounded-xl border px-4 py-2 text-sm font-bold">Website openen</Link><form action={godModeLogout}><button className="rounded-xl border px-4 py-2 text-sm font-bold">God Mode afsluiten</button></form></div>
      </header>
      <GodStudio/>
    </div>
  </main>
}
