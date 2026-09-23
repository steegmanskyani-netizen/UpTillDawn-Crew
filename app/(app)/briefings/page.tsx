import { createClient } from '@/lib/supabase/crew-server'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/actions/auth'
import {
  acknowledgeBriefing,
  acknowledgeInstruction,
  createBriefing,
  createPersonalInstruction,
  updateBriefing,
  updatePersonalInstruction,
} from '@/lib/actions/uptilldawn'
import {
  AssignmentScopeFields,
  type AssignmentEvent,
  type AssignmentMembership,
  type AssignmentPerson,
  type AssignmentWorkplace,
} from '@/components/crew/assignment-scope-fields'
import type { Tables } from '@/types/crew-database'

function PhotoInput() {
  return <label className="grid gap-1 text-sm">
    Foto&apos;s
    <input
      name="photos"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      multiple
      className="rounded-lg border bg-background p-2"
    />
    <span className="text-xs text-muted-foreground">Maximaal 5 foto&apos;s per instructie, maximaal 10 MB per foto.</span>
  </label>
}

function PhotoGallery({
  rows,
  urls,
}: {
  rows: Tables<'work_attachments'>[]
  urls: Map<string, string>
}) {
  if (!rows.length) return null
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {rows.map(row => {
      const url = urls.get(row.storage_path)
      if (!url) return null
      return <a key={row.id} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border bg-black/10">
        {/* Private signed storage URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Foto bij instructie" className="h-36 w-full object-cover"/>
      </a>
    })}
  </div>
}

export default async function Page() {
  const s = await createClient()
  const user = await getCurrentUser()
  if (!user) return null

  const isAdmin = user.role === 'admin'
  const isResponsible = user.role === 'responsible_lead'
  const manager = isAdmin || isResponsible

  const [
    { data: briefs, error },
    { data: personal },
    { data: acks },
    { data: packs },
  ] = await Promise.all([
    s.from('briefings').select('*').order('created_at', { ascending: false }),
    s.from('personal_instructions').select('*').order('created_at', { ascending: false }),
    s.from('briefing_acknowledgements').select('*').eq('user_id', user.id),
    s.from('personal_instruction_acknowledgements').select('*').eq('user_id', user.id),
  ])

  let events: AssignmentEvent[] = []
  let workplaces: AssignmentWorkplace[] = []
  let people: AssignmentPerson[] = []
  let memberships: AssignmentMembership[] = []

  if (isAdmin) {
    const [
      { data: eventRows },
      { data: workplaceRows },
      { data: personRows },
      { data: eventMembers },
      { data: shiftRows },
    ] = await Promise.all([
      s.from('events').select('id,name').neq('status', 'archived').order('start_at'),
      s.from('workplaces').select('id,name,event_id').eq('is_active', true).order('sort_order'),
      s.from('profiles').select('id,full_name').eq('approved', true).order('full_name'),
      s.from('event_members').select('event_id,user_id'),
      s.from('shifts').select('event_id,workplace_id,user_id').neq('status', 'cancelled'),
    ])

    events = eventRows || []
    workplaces = workplaceRows || []
    people = personRows || []
    memberships = [
      ...(eventMembers || []).map(row => ({ event_id: row.event_id, workplace_id: null, user_id: row.user_id })),
      ...(shiftRows || []).map(row => ({ event_id: row.event_id, workplace_id: row.workplace_id, user_id: row.user_id })),
    ]
  } else if (isResponsible) {
    const { data: responsibilities } = await s
      .from('responsible_assignments')
      .select('event_id,workplace_id')
      .eq('user_id', user.id)

    const workplaceIds = [...new Set((responsibilities || []).map(row => row.workplace_id))]
    if (workplaceIds.length) {
      const { data: workplaceRows } = await s
        .from('workplaces')
        .select('id,name,event_id')
        .in('id', workplaceIds)
        .eq('is_active', true)
        .order('sort_order')

      workplaces = workplaceRows || []

      const eventIds = [...new Set(workplaces.map(workplace => workplace.event_id))]
      if (eventIds.length) {
        const { data: eventRows } = await s
          .from('events')
          .select('id,name')
          .in('id', eventIds)
          .neq('status', 'archived')
          .order('start_at')
        events = eventRows || []
      }

      const directories = await Promise.all((responsibilities || []).map(async responsibility => {
        const { data } = await s.rpc('upt_responsible_event_members', {
          p_event: responsibility.event_id,
          p_workplace: responsibility.workplace_id,
        })
        return {
          responsibility,
          people: data || [],
        }
      }))

      const uniquePeople = new Map<string, AssignmentPerson>()
      for (const directory of directories) {
        for (const person of directory.people) {
          uniquePeople.set(person.id, { id: person.id, full_name: person.full_name })
          memberships.push({
            event_id: directory.responsibility.event_id,
            workplace_id: directory.responsibility.workplace_id,
            user_id: person.id,
          })
        }
      }
      people = [...uniquePeople.values()].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'nl'))
    }
  }

  if (!manager && !(briefs?.length || personal?.length)) redirect('/')

  const attachments: Tables<'work_attachments'>[] = []
  const briefingIds = (briefs || []).map(item => item.id)
  const personalIds = (personal || []).map(item => item.id)

  if (briefingIds.length) {
    const { data } = await s.from('work_attachments').select('*').in('briefing_id', briefingIds).order('created_at')
    attachments.push(...(data || []))
  }
  if (personalIds.length) {
    const { data } = await s.from('work_attachments').select('*').in('personal_instruction_id', personalIds).order('created_at')
    attachments.push(...(data || []))
  }

  const photoUrls = new Map<string, string>()
  await Promise.all(attachments.map(async attachment => {
    const { data } = await s.storage.from('work-media').createSignedUrl(attachment.storage_path, 300)
    if (data?.signedUrl) photoUrls.set(attachment.storage_path, data.signedUrl)
  }))

  const briefingPhotos = (id: string) => attachments.filter(item => item.briefing_id === id)
  const instructionPhotos = (id: string) => attachments.filter(item => item.personal_instruction_id === id)

  return <main className="space-y-5 p-4 md:p-8">
    <div>
      <h1 className="text-3xl font-black">Instructies</h1>
      {isResponsible && <p className="text-sm text-muted-foreground">Je kunt alleen instructies beheren voor personeel binnen je toegewezen werkplekken.</p>}
    </div>

    {manager && (isAdmin || workplaces.length > 0) && <div className="grid gap-4 lg:grid-cols-2">
      <form action={createBriefing} className="grid gap-3 rounded-xl border p-4">
        <h2 className="font-bold">Nieuwe algemene instructie</h2>
        <AssignmentScopeFields
          events={events}
          workplaces={workplaces}
          people={people}
          memberships={memberships}
          isAdmin={isAdmin}
          requirePerson={false}
          workplaceRequired={!isAdmin}
        />
        <input name="title" required placeholder="Titel" className="border bg-background p-3"/>
        <textarea name="body" required placeholder="Algemene instructie" className="min-h-28 border bg-background p-3"/>
        <PhotoInput />
        <button className="rounded-xl bg-violet-600 p-3">Instructie aanmaken</button>
      </form>

      <form action={createPersonalInstruction} className="grid gap-3 rounded-xl border border-violet-500 p-4">
        <h2 className="font-bold">Persoonlijke instructie</h2>
        <AssignmentScopeFields
          events={events}
          workplaces={workplaces}
          people={people}
          memberships={memberships}
          isAdmin={isAdmin}
          workplaceRequired={!isAdmin}
        />
        <input name="title" required placeholder="Titel" className="border bg-background p-3"/>
        <textarea name="body" required placeholder="Persoonlijke instructie" className="min-h-28 border bg-background p-3"/>
        <PhotoInput />
        <button className="rounded-xl bg-violet-600 p-3">Instructie toewijzen</button>
      </form>
    </div>}

    {error && <p>Instructies konden niet worden geladen.</p>}

    {briefs?.map(briefing => <article key={briefing.id} className="space-y-3 rounded-xl border p-4">
      <h2 className="text-xl font-bold">{briefing.title} · v{briefing.version}</h2>
      <p className="whitespace-pre-wrap">{briefing.body}</p>
      <PhotoGallery rows={briefingPhotos(briefing.id)} urls={photoUrls}/>

      {manager
        ? <form action={updateBriefing} className="grid gap-2 border-t pt-3">
            <input type="hidden" name="id" value={briefing.id}/>
            <input name="title" defaultValue={briefing.title} required className="border bg-background p-2"/>
            <textarea name="body" defaultValue={briefing.body} required className="border bg-background p-2"/>
            <PhotoInput />
            <button className="rounded-lg border p-2">Wijzig instructie + nieuwe bevestiging</button>
          </form>
        : acks?.some(ack => ack.briefing_id === briefing.id && ack.version === briefing.version)
          ? <p>INSTRUCTIE GELEZEN</p>
          : <form action={acknowledgeBriefing}>
              <input type="hidden" name="id" value={briefing.id}/>
              <button className="rounded-xl border p-3">INSTRUCTIE GELEZEN</button>
            </form>}
    </article>)}

    {personal?.map(instruction => <article key={instruction.id} className="space-y-3 rounded-xl border border-violet-500 p-4">
      <h2 className="text-xl font-bold">Persoonlijk: {instruction.title} · v{instruction.version}</h2>
      <p className="whitespace-pre-wrap">{instruction.body}</p>
      <PhotoGallery rows={instructionPhotos(instruction.id)} urls={photoUrls}/>

      {manager
        ? <form action={updatePersonalInstruction} className="grid gap-2 border-t pt-3">
            <input type="hidden" name="id" value={instruction.id}/>
            <input name="title" defaultValue={instruction.title} required className="border bg-background p-2"/>
            <textarea name="body" defaultValue={instruction.body} required className="border bg-background p-2"/>
            <PhotoInput />
            <button className="rounded-lg border p-2">Wijzig instructie + nieuwe bevestiging</button>
          </form>
        : packs?.some(ack => ack.instruction_id === instruction.id && ack.version === instruction.version)
          ? <p>Gelezen</p>
          : <form action={acknowledgeInstruction}>
              <input type="hidden" name="id" value={instruction.id}/>
              <button className="rounded-xl border p-3">Gelezen bevestigen</button>
            </form>}
    </article>)}
  </main>
}
