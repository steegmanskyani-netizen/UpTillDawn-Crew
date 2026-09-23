import {createClient} from '@/lib/supabase/crew-server'
import {getCurrentUser} from '@/lib/actions/auth'
import {acknowledgeBriefing,acknowledgeInstruction,createBriefing,createPersonalInstruction,updateBriefing,updatePersonalInstruction} from '@/lib/actions/uptilldawn'

export default async function Page(){
 const s=await createClient();const user=await getCurrentUser();if(!user)return null
 const [{data:briefs,error},{data:personal},{data:acks},{data:packs},{data:events},{data:people}]=await Promise.all([
  s.from('briefings').select('*').order('created_at',{ascending:false}),
  s.from('personal_instructions').select('*').order('created_at',{ascending:false}),
  s.from('briefing_acknowledgements').select('*').eq('user_id',user.id),
  s.from('personal_instruction_acknowledgements').select('*').eq('user_id',user.id),
  s.from('events').select('id,name'),
  user.isAdmin?s.from('profiles').select('id,full_name').eq('approved',true).order('full_name'):Promise.resolve({data:[]})
 ])
 return <main className="space-y-5 p-4 md:p-8"><h1 className="text-3xl font-black">Briefings & instructies</h1>
 {user.isAdmin&&<div className="grid gap-4 lg:grid-cols-2">
  <form action={createBriefing} className="grid gap-3 rounded-xl border p-4"><h2 className="font-bold">Nieuwe briefing</h2><select name="event_id" required className="border bg-background p-3">{events?.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><input name="title" required placeholder="Titel" className="border bg-background p-3"/><textarea name="body" required placeholder="Algemene briefing" className="min-h-28 border bg-background p-3"/><button className="rounded-xl bg-violet-600 p-3">Briefing aanmaken</button></form>
  <form action={createPersonalInstruction} className="grid gap-3 rounded-xl border border-violet-500 p-4"><h2 className="font-bold">Persoonlijke instructie</h2><select name="event_id" required className="border bg-background p-3">{events?.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><select name="user_id" required className="border bg-background p-3"><option value="">Selecteer medewerker</option>{people?.map(p=><option key={p.id} value={p.id}>{p.full_name||'Naam ontbreekt'}</option>)}</select><input name="title" required placeholder="Titel" className="border bg-background p-3"/><textarea name="body" required placeholder="Persoonlijke instructie" className="min-h-28 border bg-background p-3"/><button className="rounded-xl bg-violet-600 p-3">Instructie toewijzen</button></form>
 </div>}
 {error&&<p>Briefings konden niet worden geladen.</p>}
 {briefs?.map(b=><article key={b.id} className="space-y-3 rounded-xl border p-4"><h2 className="text-xl font-bold">{b.title} · v{b.version}</h2><p className="whitespace-pre-wrap">{b.body}</p>{user.isAdmin?<form action={updateBriefing} className="grid gap-2 border-t pt-3"><input type="hidden" name="id" value={b.id}/><input name="title" defaultValue={b.title} required className="border bg-background p-2"/><textarea name="body" defaultValue={b.body} required className="border bg-background p-2"/><button className="rounded-lg border p-2">Wijzig briefing + nieuwe bevestiging</button></form>:acks?.some(a=>a.briefing_id===b.id&&a.version===b.version)?<p>BRIEFING READ</p>:<form action={acknowledgeBriefing}><input type="hidden" name="id" value={b.id}/><button className="rounded-xl border p-3">BRIEFING READ</button></form>}</article>)}
 {personal?.map(b=><article key={b.id} className="space-y-3 rounded-xl border border-violet-500 p-4"><h2 className="text-xl font-bold">Persoonlijk: {b.title} · v{b.version}</h2><p className="whitespace-pre-wrap">{b.body}</p>{user.isAdmin?<form action={updatePersonalInstruction} className="grid gap-2 border-t pt-3"><input type="hidden" name="id" value={b.id}/><input name="title" defaultValue={b.title} required className="border bg-background p-2"/><textarea name="body" defaultValue={b.body} required className="border bg-background p-2"/><button className="rounded-lg border p-2">Wijzig instructie + nieuwe bevestiging</button></form>:packs?.some(a=>a.instruction_id===b.id&&a.version===b.version)?<p>Gelezen</p>:<form action={acknowledgeInstruction}><input type="hidden" name="id" value={b.id}/><button className="rounded-xl border p-3">Gelezen bevestigen</button></form>}</article>)}
 </main>
}
