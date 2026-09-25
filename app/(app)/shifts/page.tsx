import { DateInput } from '@/components/crew/date-input'
import { AdminOnly } from '@/components/auth/admin-only'
import { StaffAvailability, StaffUnavailableMessage } from '@/components/auth/staff-availability'
import { createClient } from '@/lib/supabase/crew-server'
import { cancelShift, createShift, updateShift } from '@/lib/actions/uptilldawn'
import { nlStatus } from '@/lib/ui-nl'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/actions/auth'

export const dynamic = 'force-dynamic'

type CrewOption = { id: string; full_name: string | null }

export default async function Page() {
  const s = await createClient()
  const current = await getCurrentUser()
  if (!current) return null
  const user = { id: current.id }

  const [
    { data: shifts, error: shiftsError },
    { data: memberships },
    { data: openEvents },
    { data: responsibleAssignments },
  ] = await Promise.all([
    s.from('shifts').select('*,workplaces(name),events(name)').order('scheduled_start'),
    s.from('event_members').select('event_id').eq('user_id', user.id),
    s.from('events').select('id').gte('end_at', 'now'),
    s.from('responsible_assignments').select('event_id,workplace_id').eq('user_id', user.id),
  ])

  const isAdmin = current.role === 'admin'
  const isResponsible = current.role === 'responsible_lead'
  const openEventIds = new Set((openEvents || []).map(event => event.id))
  const assignedEventIds = new Set([
    ...(memberships || []).map(member => member.event_id),
    ...(shifts || []).filter(shift => shift.user_id === user.id).map(shift => shift.event_id),
    ...(responsibleAssignments || []).map(row => row.event_id),
  ])
  const hasOpenAssignedEvent = [...assignedEventIds].some(eventId => openEventIds.has(eventId))
  const visibleShifts = isAdmin
    ? (shifts || [])
    : isResponsible
      ? (shifts || []).filter(shift => assignedEventIds.has(shift.event_id))
      : (shifts || []).filter(shift => shift.user_id === user.id)
  if (!isAdmin && !hasOpenAssignedEvent) redirect('/events')
  let workplaces: Array<{ id: string; name: string; event_id: string; events: { name: string } | null }> = []
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
  }

  return <main className="space-y-5 p-4 md:p-8">
    <div>
      <h1 className="text-3xl font-black">Diensten</h1>
      {!isAdmin && <p className="text-sm text-muted-foreground">Diensten kunnen enkel door admin worden aangemaakt of aangepast.</p>}
    </div>

    {isAdmin && workplaces.length > 0 && <AdminOnly><form action={createShift} className="grid gap-2 rounded-2xl border p-4 md:grid-cols-3">
      <select name="workplace_id" required className="rounded-lg border bg-background p-3">
        <option value="">Werkplek…</option>
        {workplaces.map(x => <option key={x.id} value={x.id}>{x.events?.name} — {x.name}</option>)}
      </select>
      <select name="user_id" required className="rounded-lg border bg-background p-3">
        <option value="">Personeelslid…</option>
        {people.map(x => <option key={x.id} value={x.id}>{x.full_name || 'Naam ontbreekt'}</option>)}
      </select>
      <input name="role_name" defaultValue="Personeel" maxLength={200} className="rounded-lg border bg-background p-3"/>
      <DateInput name="start"/>
      <DateInput name="end"/>
      <label className="flex items-center gap-2"><input type="checkbox" name="overlap_allowed"/> Overlap expliciet toestaan</label>
      <button className="rounded-lg bg-violet-600 p-3 font-bold md:col-span-3">DIENST AANMAKEN</button>
    </form></AdminOnly>}

    {isAdmin && !workplaces.length && <AdminOnly><p className="rounded-xl border p-4 text-muted-foreground">Geen actieve werkplekken gevonden.</p></AdminOnly>}
    {shiftsError && <p>Diensten konden niet worden geladen.</p>}
    <StaffUnavailableMessage available={hasOpenAssignedEvent}>
      <p className="rounded-xl border p-4 text-muted-foreground">Diensten worden zichtbaar zodra je aan een evenement bent toegewezen.</p>
    </StaffUnavailableMessage>
    {!isAdmin && hasOpenAssignedEvent && !visibleShifts.some(shift => shift.user_id === user.id) && <p className="rounded-xl border p-4 text-muted-foreground">Geen toegewezen diensten.</p>}

    <div className="grid gap-3">
      {visibleShifts.map(x => {
        const canManage = isAdmin && managedWorkplaces.has(x.workplace_id)
        return <StaffAvailability key={x.id} available={x.user_id === user.id}><article className="rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <b>{people.find(q => q.id === x.user_id)?.full_name || (x.user_id === user.id ? 'Jij' : 'Personeelslid')}</b> · {x.events?.name} / {x.workplaces?.name}
              <div className="text-sm text-muted-foreground">{new Date(x.scheduled_start).toLocaleString('nl-BE')} → {new Date(x.scheduled_end).toLocaleString('nl-BE')} · {x.role_name}</div>
            </div>
            <span className="rounded-full border px-2 py-1 text-xs font-bold">{nlStatus(x.status)}</span>
          </div>

          {canManage && x.status !== 'cancelled' && <AdminOnly><details className="mt-4 rounded-xl border p-3">
            <summary className="cursor-pointer font-semibold">Dienst beheren</summary>
            <form action={updateShift} className="mt-3 grid gap-2 md:grid-cols-2">
              <input type="hidden" name="shift_id" value={x.id}/>
              <label className="grid gap-1 text-sm">Rol<input name="role_name" required maxLength={200} defaultValue={x.role_name === 'Crew' ? 'Personeel' : x.role_name} className="rounded-lg border bg-background p-3"/></label>
              <label className="flex items-center gap-2 self-end pb-3"><input type="checkbox" name="overlap_allowed" defaultChecked={x.overlap_allowed}/> Overlap expliciet toestaan</label>
              <DateInput name="start" initial={x.scheduled_start}/>
              <DateInput name="end" initial={x.scheduled_end}/>
              <button className="rounded-lg border p-3 font-bold md:col-span-2">WIJZIG DIENST</button>
            </form>
            <form action={cancelShift} className="mt-4 flex flex-col gap-2 border-t pt-4 md:flex-row">
              <input type="hidden" name="shift_id" value={x.id}/>
              <input name="reason" maxLength={500} placeholder="Reden annulering (optioneel)" className="min-w-0 flex-1 rounded-lg border bg-background p-3"/>
              <button className="rounded-lg bg-red-700 px-4 py-3 font-bold text-white">ANNULEER DIENST</button>
            </form>
          </details></AdminOnly>}
        </article></StaffAvailability>
      })}
    </div>
  </main>
}
