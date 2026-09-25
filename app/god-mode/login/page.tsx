import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/crew-server'
import { godModeLogin } from '@/lib/actions/god-mode'

export const dynamic='force-dynamic'

export default async function GodModeLoginPage({searchParams}:{searchParams:Promise<{error?:string}>}){
  const store=await cookies()
  const existing=store.get('uptilldawn-god-session')?.value
  if(existing){
    const s=await createClient()
    const {data:valid}=await s.rpc('upt_god_session_valid',{p_token:existing})
    if(valid===true)redirect('/god-mode')
  }

  const params=await searchParams
  return <main className="grid min-h-screen place-items-center bg-black p-5 text-white">
    <section className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
      <h1 className="text-xl font-black">Beveiligde toegang</h1>
      <form action={godModeLogin} className="mt-6 space-y-4">
        <label className="grid gap-1 text-sm">Login
          <input name="login" type="text" required autoComplete="username" className="rounded-xl border border-white/15 bg-black p-3 outline-none"/>
        </label>
        <label className="grid gap-1 text-sm">Wachtwoord
          <input name="password" type="password" required autoComplete="current-password" className="rounded-xl border border-white/15 bg-black p-3 outline-none"/>
        </label>
        {params.error?<p className="text-sm text-red-400">Toegang geweigerd.</p>:null}
        <button className="w-full rounded-xl bg-white p-3 font-black text-black">AANMELDEN</button>
      </form>
    </section>
  </main>
}
