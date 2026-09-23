import { createClient } from '@/lib/supabase/crew-server'
import { addWorkplace, assignResponsible } from '@/lib/actions/uptilldawn'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return null

  const { data: profile } = await s.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'
  const isResponsible = profile?.role === 'responsible_lead'
  if (!isAdmin && !isResponsible) redirect('/')

  const [{ data: allWorkplaces }, { data: events }] = await Promise.all([
    s.from('workplaces').select('*,events(name)').order('sort_order'),
    s.from('events').select('id,name').order('start_at'),
  ])

  let workplaces = allWorkplaces || []
  let leads: Array<{ id: string; full_name: string | null }> = []

  if (isAdmin) {
    const { data } = await s.from('profiles').select('id,full_name,role').eq('approved', true).in('role', ['responsible_lead','admin']).order('full_name')
    leads = (data || []).map(p => ({ id: p.id, full_name: p.full_name }))
  } else if (isResponsible) {
    const { data: responsibilities } = await s.from('responsible_assignments').select('workplace_id').eq('user_id', user.id)
    const allowed = new Set((responsibilities || []).map(r => r.workplace_id))
    workplaces = workplaces.filter(w => allowed.has(w.id))
  }

  return <main className="space-y-5 p-4 md:p-8">
    <div>
      <h1 className="text-3xl font-black">Workplaces</h1>
      {isResponsible && <p className="text-sm text-muted-foreground">Alleen je toegewezen werkplekken worden hier getoond.</p>}
    </div>

    {isAdmin && <form action={addWorkplace} className="flex flex-wrap gap-2 rounded-2xl border p-4">
      <select name="event_id" required className="rounded-lg border bg-background p-3">
        <option value="">Event…</option>
        {events?.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <input name="name" required maxLength={200} placeholder="Nieuwe workplace" className="rounded-lg border bg-background p-3"/>
      <button className="rounded-lg bg-violet-600 px-4 font-bold">TOEVOEGEN</button>
    </form>}

    <div className="grid gap-3 md:grid-cols-2">
      {workplaces.map(x => <article key={x.id} className="rounded-2xl border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <b>{x.name}</b>
            <p className="text-sm text-muted-foreground">{x.events?.name}</p>
          </div>
          <span className="rounded-full border px-2 py-1 text-xs">{x.is_active ? 'ACTIEF' : 'INACTIEF'}</span>
        </div>
        {isAdmin && <form action={assignResponsible} className="mt-3 flex gap-2">
          <input type="hidden" name="workplace_id" value={x.id}/>
          <select name="user_id" required className="flex-1 rounded-lg border bg-background p-2">
            <option value="">Responsible lead…</option>
            {leads.map(q => <option key={q.id} value={q.id}>{q.full_name || 'Naam ontbreekt'}</option>)}
          </select>
          <button className="rounded-lg border px-3">Assign</button>
        </form>}
      </article>)}
    </div>

    {!workplaces.length && <p className="rounded-xl border p-4 text-muted-foreground">Geen werkplekken beschikbaar.</p>}
  </main>
}
