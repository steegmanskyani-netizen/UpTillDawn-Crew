import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-server'
import { configureGodMode } from '@/lib/actions/god-mode'

export const dynamic='force-dynamic'

export default async function GodModeSetupPage(){
  const s=await createClient()
  const {data:{user}}=await s.auth.getUser()
  if(!user)redirect('/login/admin')
  const {data:isOwner}=await s.rpc('upt_current_is_owner')
  if(isOwner!==true)redirect('/admin')
  const {data:configured}=await s.rpc('upt_god_is_configured')

  return <main className="grid min-h-screen place-items-center bg-black p-5 text-white">
    <section className="w-full max-w-md rounded-3xl border border-white/15 bg-zinc-950 p-6">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-400">God Mode setup</p>
      <h1 className="mt-2 text-2xl font-black">{configured?'God Mode login wijzigen':'God Mode eenmalig activeren'}</h1>
      <p className="mt-2 text-sm text-zinc-400">Deze setup is alleen bereikbaar voor het permanente maker-account. Het wachtwoord wordt uitsluitend gehasht in de private database opgeslagen.</p>
      <form action={configureGodMode} className="mt-6 space-y-4">
        <label className="grid gap-1 text-sm">Login
          <input name="login" readOnly value="godmode@uptilldawn" className="rounded-xl border border-white/15 bg-black p-3"/>
        </label>
        <label className="grid gap-1 text-sm">God Mode wachtwoord
          <input name="password" type="password" minLength={10} required autoComplete="new-password" className="rounded-xl border border-white/15 bg-black p-3"/>
        </label>
        <label className="grid gap-1 text-sm">Bevestig wachtwoord
          <input name="confirm_password" type="password" minLength={10} required autoComplete="new-password" className="rounded-xl border border-white/15 bg-black p-3"/>
        </label>
        <button className="w-full rounded-xl bg-amber-400 p-3 font-black text-black">{configured?'LOGIN WIJZIGEN':'GOD MODE ACTIVEREN'}</button>
      </form>
    </section>
  </main>
}
