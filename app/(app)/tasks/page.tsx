import { createTask, removeTaskAssignment } from '@/lib/actions/uptilldawn'
import { createClient } from '@/lib/supabase/crew-server'
import { TaskControls } from '@/components/crew/task-controls'
import { ResponsibleTaskTest } from '@/components/crew/responsible-task-test'
import { nlStatus } from '@/lib/ui-nl'

export const dynamic = 'force-dynamic'

type CrewOption = { id: string; full_name: string | null }
type WorkplaceOption = { id: string; name: string; event_id: string; events: { name: string } | null }

export default async function Page() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: events }, { data, error }] = await Promise.all([
    s.from('profiles').select('role').eq('id', user.id).single(),
    s.from('events').select('id,name').neq('status', 'archived').order('start_at'),
    s.from('task_assignments').select('id,user_id,status,tasks(id,title,description,event_id,workplace_id)').order('created_at'),
  ])

  const isAdmin = profile?.role === 'admin'
  const isResponsible = profile?.role === 'responsible_lead'
  const manager = isAdmin || isResponsible
  let workplaces: WorkplaceOption[] = []
  let people: CrewOption[] = []
  const managedWorkplaces = new Set<string>()

  if (isAdmin) {
    const [{ data: w }, { data: p }] = await Promise.all([
      s.from('workplaces').select('id,name,event_id,events(name)').eq('is_active', true).order('sort_order'),
      s.from('profiles').select('id,full_name').eq('approved', true).order('full_name'),
    ])
    workplaces = w || []
    people = p || []
    for (const workplace of workplaces) managedWorkplaces.add(workplace.id)
  } else if (isResponsible) {
    const { data: responsibilities } = await s.from('responsible_assignments').select('event_id,workplace_id').eq('user_id', user.id)
    const ids = [...new Set((responsibilities || []).map(r => r.workplace_id))]
    if (ids.length) {
      const { data: w } = await s.from('workplaces').select('id,name,event_id,events(name)').in('id', ids).eq('is_active', true).order('sort_order')
      workplaces = w || []
      for (const workplace of workplaces) managedWorkplaces.add(workplace.id)

      const directories = await Promise.all((responsibilities || []).map(r =>
        s.rpc('upt_responsible_event_members', { p_event: r.event_id, p_workplace: r.workplace_id })
      ))
      const unique = new Map<string, CrewOption>()
      for (const directory of directories) {
        for (const member of directory.data || []) unique.set(member.id, { id: member.id, full_name: member.full_name })
      }
      people = [...unique.values()].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'nl'))
    }
  }

  return <main className="space-y-4 p-4 md:p-8">
    {isAdmin && <ResponsibleTaskTest workplaces={workplaces} people={people} />}
    <div>
      <h1 className="text-3xl font-black">Taken</h1>
      {isResponsible && <p className="text-sm text-muted-foreground">Je beheert alleen taakpakketten binnen je eigen werkplek.</p>}
    </div>

    {manager && (isAdmin || workplaces.length > 0) && <form action={createTask} className="grid gap-3 rounded-xl border p-4 md:grid-cols-2">
      {isAdmin && <select name="event_id" required className="border bg-background p-3">
        <option value="">Evenement…</option>
        {events?.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>}
      <select name="workplace_id" required={!isAdmin} className="border bg-background p-3">
        {isAdmin && <option value="">Geen werkplek — voor heel evenement</option>}
        {!isAdmin && <option value="">Werkplek…</option>}
        {workplaces.map(w => <option key={w.id} value={w.id}>{w.events?.name} — {w.name}</option>)}
      </select>
      <select name="user_id" required className="border bg-background p-3">
        <option value="">Medewerker…</option>
        {people.map(p => <option key={p.id} value={p.id}>{p.full_name || 'Naam ontbreekt'}</option>)}
      </select>
      <input name="title" required maxLength={200} placeholder="Taaknaam" className="border bg-background p-3"/>
      <textarea name="description" maxLength={4000} placeholder="Omschrijving" className="border bg-background p-3 md:col-span-2"/>
      <button className="rounded-xl bg-violet-600 p-3 font-bold md:col-span-2">TAAK AANMAKEN & TOEWIJZEN</button>
    </form>}

    {error ? <p>Taken konden niet worden geladen.</p> : !data?.length ? <p>Geen toegewezen taken.</p> : data.map(t => {
      const task = t.tasks
      const canManage = Boolean(manager && task && (isAdmin || (task.workplace_id && managedWorkplaces.has(task.workplace_id))))
      return <article key={t.id} className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">{task?.title}</h2>
            <p className="whitespace-pre-wrap">{task?.description}</p>
            <p className="mt-2 text-sm text-muted-foreground">Voor: {t.user_id === user.id ? 'Jij' : people.find(p => p.id === t.user_id)?.full_name || 'Personeelslid'} · {nlStatus(t.status)}</p>
          </div>
          {t.user_id === user.id && <TaskControls id={t.id} userId={user.id}/>}
        </div>
        {canManage && <form action={removeTaskAssignment} className="mt-3 border-t pt-3">
          <input type="hidden" name="assignment_id" value={t.id}/>
          <button className="rounded-lg border px-3 py-2 text-sm">Toewijzing verwijderen</button>
        </form>}
      </article>
    })}
  </main>
}
