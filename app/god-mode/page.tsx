import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-server'
import { GodModeEditor } from '@/components/god-mode/god-mode-editor'

export const dynamic='force-dynamic'

export default async function GodModePage(){
  const token=(await cookies()).get('uptilldawn-god-session')?.value
  if(!token)redirect('/login/admin')
  const s=await createClient()
  const {data:valid}=await s.rpc('upt_god_session_valid',{p_token:token})
  if(valid!==true)redirect('/login/admin')

  return <main className="min-h-screen bg-background p-4 pb-16 md:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-500">God Mode</p>
        <h1 className="mt-1 text-3xl font-black">App editor</h1>
        <p className="mt-2 text-sm text-muted-foreground">Volledig gescheiden van de normale adminomgeving. Wijzig hier navigatie, rolrechten en AI-voorstellen.</p>
      </header>
      <GodModeEditor/>
    </div>
  </main>
}
