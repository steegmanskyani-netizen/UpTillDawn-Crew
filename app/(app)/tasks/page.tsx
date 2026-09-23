import { createTask, removeTaskAssignment } from '@/lib/actions/uptilldawn'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-server'
import { TaskControls } from '@/components/crew/task-controls'
import { ManagerOnly } from '@/components/auth/manager-only'
import { ResponsibleTaskTest } from '@/components/crew/responsible-task-test'
import {
  AssignmentScopeFields,
  type AssignmentMembership,
} from '@/components/crew/assignment-scope-fields'
import { nlStatus } from '@/lib/ui-nl'
import type { Tables } from '@/types/crew-database'

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

  let visibleAssignments = data || []
  if (!manager) {
    const now = new Date().toISOString()
    const { data: activeEvents } = await s
      .from('events')
      .select('id')
      .lte('start_at', now)
      .gte('end_at', now)

    const activeEventIds = new Set((activeEvents || []).map(event => event.id))
    visibleAssignments = visibleAssignments.filter(item => item.tasks && activeEventIds.has(item.tasks.event_id))

    if (!visibleAssignments.length) {
      return <main className="p-8">Taken zijn beschikbaar vanaf de start van een toegewezen evenement.</main>
    }
  }

  const attachmentRows: Tables<'work_attachments'>[] = []
  const taskIds = visibleAssignments.map(item => item.tasks?.id).filter((id): id is string => Boolean(id))
  if (taskIds.length) {
    const { data: media } = await s.from('work_attachments').select('*').in('task_id', taskIds).order('created_at')
    attachmentRows.push(...(media || []))
  }

  const photoUrls = new Map<string, string>()
  await Promise.all(attachmentRows.map(async attachment => {
    const { data: signed } = await s.storage.from('work-media').createSignedUrl(attachment.storage_path, 300)
    if (signed?.signedUrl) photoUrls.set(attachment.storage_path, signed.signedUrl)
  }))

  let workplaces: WorkplaceOption[] = []
  let people: CrewOption[] = []
  let memberships: AssignmentMembership[] = []
  const managedWorkplaces = new Set<string>()

  if (isAdmin) {
    const [{ data: w }, { data: p }, { data: eventMembers }, { data: shiftRows }] = await Promise.all([
      s.from('workplaces').select('id,name,event_id,events(name)').eq('is_active', true).order('sort_order'),
      s.from('profiles').select('id,full_name').eq('approved', true).order('full_name'),
      s.from('event_members').select('event_id,user_id'),
      s.from('shifts').select('event_id,workplace_id,user_id').neq('status', 'cancelled'),
    ])
    workplaces = w || []
    people = p || []
    memberships = [
      ...(eventMembers || []).map(row => ({ event_id: row.event_id, workplace_id: null, user_id: row.user_id })),
      ...(shiftRows || []).map(row => ({ event_id: row.event_id, workplace_id: row.workplace_id, user_id: row.user_id })),
    ]
    for (const workplace of workplaces) managedWorkplaces.add(workplace.id)
  } else if (isResponsible) {
    const { data: responsibilities } = await s.from('responsible_assignments').select('event_id,workplace_id').eq('user_id', user.id)
    const ids = [...new Set((responsibilities || []).map(r => r.workplace_id))]
    if (ids.length) {
      const { data: w } = await s.from('workplaces').select('id,name,event_id,events(name)').in('id', ids).eq('is_active', true).order('sort_order')
      workplaces = w || []
      for (const workplace of workplaces) managedWorkplaces.add(workplace.id)

      const directories = await Promise.all((responsibilities || []).map(async r => ({
        responsibility: r,
        result: await s.rpc('upt_responsible_event_members', { p_event: r.event_id, p_workplace: r.workplace_id }),
      })))
      const unique = new Map<string, CrewOption>()
      for (const directory of directories) {
        for (const member of directory.result.data || []) {
          unique.set(member.id, { id: member.id, full_name: member.full_name })
          memberships.push({
            event_id: directory.responsibility.event_id,
            workplace_id: directory.responsibility.workplace_id,
            user_id: member.id,
          })
        }
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

    {manager && (isAdmin || workplaces.length > 0) && <ManagerOnly><form action={createTask} className="grid gap-3 rounded-xl border p-4 md:grid-cols-2">
      <AssignmentScopeFields
        events={events || []}
        workplaces={workplaces.map(workplace => ({ id: workplace.id, name: workplace.name, event_id: workplace.event_id }))}
        people={people}
        memberships={memberships}
        isAdmin={isAdmin}
        workplaceRequired={!isAdmin}
      />
      <input name="title" required maxLength={200} placeholder="Taaknaam" className="border bg-background p-3"/>
      <textarea name="description" maxLength={4000} placeholder="Omschrijving" className="border bg-background p-3 md:col-span-2"/>
      <label className="grid gap-1 text-sm md:col-span-2">
        Foto&apos;s
        <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="rounded-lg border bg-background p-2"/>
        <span className="text-xs text-muted-foreground">Maximaal 5 foto&apos;s per taak, maximaal 10 MB per foto.</span>
      </label>
      <button className="rounded-xl bg-violet-600 p-3 font-bold md:col-span-2">TAAK AANMAKEN & TOEWIJZEN</button>
    </form></ManagerOnly>}

    {error ? <p>Taken konden niet worden geladen.</p> : !visibleAssignments.length ? <p>Geen toegewezen taken.</p> : visibleAssignments.map(t => {
      const task = t.tasks
      const canManage = Boolean(manager && task && (isAdmin || (task.workplace_id && managedWorkplaces.has(task.workplace_id))))
      const article = <article className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">{task?.title}</h2>
            <p className="whitespace-pre-wrap">{task?.description}</p>
            {!!task && attachmentRows.some(item => item.task_id === task.id) && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {attachmentRows.filter(item => item.task_id === task.id).map(item => {
                const url = photoUrls.get(item.storage_path)
                if (!url) return null
                return <a key={item.id} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border bg-black/10">
                  {/* Private signed storage URL. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Foto bij taak" className="h-36 w-full object-cover"/>
                </a>
              })}
            </div>}
            <p className="mt-2 text-sm text-muted-foreground">Voor: {t.user_id === user.id ? 'Jij' : people.find(p => p.id === t.user_id)?.full_name || 'Personeelslid'} · {nlStatus(t.status)}</p>
          </div>
          {t.user_id === user.id && <TaskControls id={t.id} userId={user.id}/>}
        </div>
        {canManage && <ManagerOnly><form action={removeTaskAssignment} className="mt-3 border-t pt-3">
          <input type="hidden" name="assignment_id" value={t.id}/>
          <button className="rounded-lg border px-3 py-2 text-sm">Toewijzing verwijderen</button>
        </form></ManagerOnly>}
      </article>
      return t.user_id === user.id
        ? <div key={t.id}>{article}</div>
        : <ManagerOnly key={t.id}>{article}</ManagerOnly>
    })}
  </main>
}
