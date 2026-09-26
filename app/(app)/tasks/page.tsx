import { createTask, removeTaskAssignment } from '@/lib/actions/uptilldawn'
import { createClient } from '@/lib/supabase/crew-server'
import { TaskControls } from '@/components/crew/task-controls'
import { ManagerOnly } from '@/components/auth/manager-only'
import { StaffAvailability, StaffUnavailableMessage } from '@/components/auth/staff-availability'
import {
  AssignmentScopeFields,
  type AssignmentMembership,
} from '@/components/crew/assignment-scope-fields'
import { nlStatus } from '@/lib/ui-nl'
import type { Tables } from '@/types/crew-database'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/actions/auth'

export const dynamic = 'force-dynamic'

type CrewOption = { id: string; full_name: string | null }
type WorkplaceOption = { id: string; name: string; event_id: string; events: { name: string } | null }

export default async function Page() {
  const s = await createClient()
  const current = await getCurrentUser()
  if (!current) return null
  const user = { id: current.id }

  const [
    { data: events },
    { data, error },
    { data: activeEvents },
    { data: ownMemberships },
    { data: availabilityRows },
    { data: openEvents },
    { data: ownActiveShifts },
  ] = await Promise.all([
    s.from('events').select('id,name').neq('status', 'archived').order('start_at'),
    s.from('task_assignments').select('id,user_id,status,confirmed_at,tasks(id,title,description,event_id,workplace_id,updated_at)').order('created_at'),
    s.from('events').select('id').lte('start_at', 'now').gte('end_at', 'now').order('start_at'),
    s.from('event_members').select('event_id').eq('user_id', user.id),
    s.from('event_availability').select('event_id,user_id').eq('response', 'can'),
    s.from('events').select('id').gte('end_at', 'now'),
    s.from('shifts')
      .select('event_id,workplace_id')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .lte('scheduled_start', 'now')
      .gte('scheduled_end', 'now'),
  ])

  const isAdmin = current.role === 'admin'
  const isResponsible = current.role === 'responsible_lead'
  const manager = isAdmin || isResponsible
  const hasActiveShift = Boolean(ownActiveShifts?.length)
  const activeShiftEventIds = new Set((ownActiveShifts || []).map(shift => shift.event_id))
  const runningEventId = ownActiveShifts?.[0]?.event_id || activeEvents?.[0]?.id || ''

  const activeEventIds = new Set((activeEvents || []).map(event => event.id))
  const openEventIds = new Set((openEvents || []).map(event => event.id))
  const activeShiftWorkplaceIds = new Set((ownActiveShifts || []).map(shift => shift.workplace_id))
  const hasOpenAssignedEvent = (ownMemberships || []).some(member => openEventIds.has(member.event_id))
  if (!manager && !hasOpenAssignedEvent) redirect('/events')
  if (!isAdmin && !hasActiveShift) {
    return <main className="space-y-4 p-4 md:p-8">
      <h1 className="text-3xl font-black">Taken</h1>
      <p className="rounded-xl border p-4 text-muted-foreground">Taken zijn beschikbaar vanaf de start van je toegewezen shift.</p>
    </main>
  }

  const responsibleAssignmentsForRole = isResponsible
    ? (await s.from('responsible_assignments').select('event_id,workplace_id').eq('user_id', user.id)).data || []
    : []
  const activeResponsibleWorkplaceIds = new Set(
    responsibleAssignmentsForRole
      .filter(row => activeShiftWorkplaceIds.has(row.workplace_id))
      .map(row => row.workplace_id),
  )

  let visibleAssignments = data || []
  if (!isAdmin && isResponsible) {
    visibleAssignments = visibleAssignments.filter(item => {
      const task = item.tasks
      if (!task) return false
      if (item.user_id === user.id && activeShiftEventIds.has(task.event_id)) return true
      return Boolean(task.workplace_id && activeResponsibleWorkplaceIds.has(task.workplace_id))
    })
  } else if (!isAdmin) {
    visibleAssignments = visibleAssignments.filter(item =>
      item.user_id === user.id
      && Boolean(item.tasks)
      && activeShiftEventIds.has(item.tasks!.event_id),
    )
  }
  const hasActiveAssignedEvent = (ownMemberships || []).some(member => activeEventIds.has(member.event_id))

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

  let selectableEvents = events || []
  let workplaces: WorkplaceOption[] = []
  let people: CrewOption[] = []
  let memberships: AssignmentMembership[] = []

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
  } else if (isResponsible) {
    const activeAssignments = responsibleAssignmentsForRole.filter(row =>
      activeShiftWorkplaceIds.has(row.workplace_id),
    )
    const eventIds = [...new Set(activeAssignments.map(row => row.event_id))]
    const workplaceIds = [...new Set(activeAssignments.map(row => row.workplace_id))]

    if (eventIds.length && workplaceIds.length) {
      const [{ data: eventRows }, { data: workplaceRows }] = await Promise.all([
        s.from('events')
          .select('id,name')
          .in('id', eventIds)
          .neq('status', 'archived')
          .gte('end_at', 'now')
          .order('start_at'),
        s.from('workplaces')
          .select('id,name,event_id,events(name)')
          .in('id', workplaceIds)
          .eq('is_active', true)
          .order('sort_order'),
      ])

      selectableEvents = eventRows || []
      workplaces = workplaceRows || []

      const directories = await Promise.all(activeAssignments.map(async assignment => ({
        eventId: assignment.event_id,
        workplaceId: assignment.workplace_id,
        result: await s.rpc('upt_responsible_event_members', {
          p_event: assignment.event_id,
          p_workplace: assignment.workplace_id,
        }),
      })))
      const unique = new Map<string, CrewOption>()
      for (const directory of directories) {
        for (const member of directory.result.data || []) {
          unique.set(member.id, { id: member.id, full_name: member.full_name })
          memberships.push({
            event_id: directory.eventId,
            workplace_id: directory.workplaceId,
            user_id: member.id,
          })
        }
      }
      people = [...unique.values()].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'nl'))
    } else {
      selectableEvents = []
    }
  }

  if (isResponsible && !isAdmin && !selectableEvents.length) redirect('/events')

  return <main className="space-y-4 p-4 md:p-8">
    <div>
      <h1 className="text-3xl font-black">Taken</h1>
      {isResponsible && <p className="text-sm text-muted-foreground">Je kunt alleen taken aanmaken en toewijzen binnen je eigen toegewezen werkplek.</p>}
      <StaffUnavailableMessage available={isAdmin || hasActiveShift}>
        <p className="mt-3 rounded-xl border p-4 text-muted-foreground">Taken zijn beschikbaar vanaf de start van je toegewezen shift.</p>
      </StaffUnavailableMessage>
    </div>

    {manager && (isAdmin || selectableEvents.length > 0) && <ManagerOnly><form action={createTask} className="grid gap-3 rounded-xl border p-4 md:grid-cols-2">
      <AssignmentScopeFields
        events={selectableEvents}
        workplaces={workplaces.map(workplace => ({ id: workplace.id, name: workplace.name, event_id: workplace.event_id }))}
        people={people}
        memberships={memberships}
        isAdmin={isAdmin}
        showEventSelect
        workplaceRequired={!isAdmin}
        multiplePeople
        availability={availabilityRows || []}
        defaultEventId={runningEventId}
      />
      <input name="title" required maxLength={200} placeholder="Taaknaam" className="border bg-background p-3"/>
      <textarea name="description" maxLength={4000} placeholder="Omschrijving" className="border bg-background p-3 md:col-span-2"/>
      <label className="grid gap-1 text-sm md:col-span-2">
        Foto&apos;s of video&apos;s
        <input name="photos" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" multiple className="rounded-lg border bg-background p-2"/>
        <span className="text-xs text-muted-foreground">Maximaal 5 bestanden per taak. Foto maximaal 10 MB, video maximaal 50 MB.</span>
      </label>
      <button className="rounded-xl bg-violet-600 p-3 font-bold md:col-span-2">TAAK AANMAKEN & TOEWIJZEN</button>
    </form></ManagerOnly>}

    {error
      ? <p>Taken konden niet worden geladen.</p>
      : !visibleAssignments.length
        ? (manager || hasActiveAssignedEvent ? <p>Geen toegewezen taken.</p> : null)
        : visibleAssignments.map(t => {
      const task = t.tasks
      const canManage = Boolean(manager && task)
      const article = <article className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">{task?.title}</h2>
            <p className="whitespace-pre-wrap">{task?.description}</p>
            {!!task && attachmentRows.some(item => item.task_id === task.id) && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {attachmentRows.filter(item => item.task_id === task.id).map(item => {
                const url = photoUrls.get(item.storage_path)
                if (!url) return null
                return item.mime_type?.startsWith('video/')
                  ? <video key={item.id} src={url} controls playsInline className="h-48 w-full rounded-xl border bg-black object-contain"/>
                  : <a key={item.id} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border bg-black/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Media bij taak" className="h-36 w-full object-cover"/>
                    </a>
              })}
            </div>}
            <p className="mt-2 text-sm text-muted-foreground">Voor: {t.user_id === user.id ? 'Jij' : people.find(p => p.id === t.user_id)?.full_name || 'Personeelslid'} · {t.confirmed_at ? nlStatus(t.status) : 'Wacht op bevestiging'}</p>
          </div>
          {t.user_id === user.id && <TaskControls id={t.id} userId={user.id} confirmed={Boolean(t.confirmed_at)}/>}
        </div>
        {canManage && <ManagerOnly><form action={removeTaskAssignment} className="mt-3 border-t pt-3">
          <input type="hidden" name="assignment_id" value={t.id}/>
          <button className="rounded-lg border px-3 py-2 text-sm">Toewijzing verwijderen</button>
        </form></ManagerOnly>}
      </article>
      return t.user_id === user.id
        ? <StaffAvailability key={t.id} available={Boolean(task && activeEventIds.has(task.event_id))}>{article}</StaffAvailability>
        : <ManagerOnly key={t.id}>{article}</ManagerOnly>
    })}
  </main>
}
