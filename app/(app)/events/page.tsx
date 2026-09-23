import { DateInput } from '@/components/crew/date-input'
import { createClient } from '@/lib/supabase/crew-server'
import { getCurrentUser } from '@/lib/actions/auth'
import {
  addEventMember,
  archiveEvent,
  createEvent,
  duplicateEvent,
  updateEvent,
} from '@/lib/actions/uptilldawn'

export const dynamic = 'force-dynamic'

const input = 'rounded-lg border bg-background p-3'

export default async function Page() {
  const s = await createClient()
  const user = await getCurrentUser()
  if (!user) return null

  const eventsResult = await s
    .from('events')
    .select('id,name,venue,start_at,status,latitude,longitude,checkin_radius_m')
    .order('start_at')

  const peopleResult = user.isAdmin
    ? await s.from('profiles').select('id,full_name').eq('approved', true).order('full_name')
    : { data: [], error: null }

  const events = eventsResult.data || []
  const people = peopleResult.data || []

  return <main className="space-y-6 p-4 md:p-8">
    <h1 className="text-3xl font-black">Events</h1>

    {user.isAdmin && <form action={createEvent} className="grid gap-3 rounded-2xl border p-4 md:grid-cols-3">
      <input name="name" required maxLength={200} placeholder="Eventnaam" className={input}/>
      <input name="venue" maxLength={200} placeholder="Locatie" className={input}/>
      <input name="address" maxLength={500} placeholder="Adres" className={input}/>
      <DateInput name="start_at"/>
      <DateInput name="end_at"/>
      <label className="grid gap-1 text-sm">
        GPS-radius (m)
        <input name="radius" type="number" defaultValue="100" min="10" max="10000" className={input}/>
      </label>
      <button className="rounded-xl bg-violet-600 p-3 font-bold md:col-span-3">EVENT AANMAKEN</button>
    </form>}

    {eventsResult.error && <p>Events konden niet worden geladen.</p>}

    {events.map(event => <article key={event.id} className="space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="text-xl font-bold">{event.name}</h2>
      <p>{event.venue || 'Locatie nog niet ingesteld'} · {new Date(event.start_at).toLocaleString('nl-BE')} · {event.status}</p>

      {user.isAdmin && <>
        <form action={addEventMember} className="flex flex-wrap gap-2">
          <input type="hidden" name="event_id" value={event.id}/>
          <select name="user_id" required className={input}>
            <option value="">Crew toevoegen…</option>
            {people.map(person => <option key={person.id} value={person.id}>{person.full_name || person.id}</option>)}
          </select>
          <button className="rounded-lg border px-3">Toevoegen</button>
        </form>

        <details>
          <summary className="cursor-pointer">Bewerken & GPS</summary>
          <form action={updateEvent} className="mt-3 grid gap-2 md:grid-cols-2">
            <input type="hidden" name="event_id" value={event.id}/>
            <input aria-label="Eventnaam" name="name" required maxLength={200} defaultValue={event.name} className={input}/>
            <input aria-label="Locatie" name="venue" maxLength={200} defaultValue={event.venue || ''} className={input}/>
            <input name="latitude" aria-label="Breedtegraad" type="number" step="any" placeholder="Breedtegraad" defaultValue={event.latitude ?? ''} className={input}/>
            <input name="longitude" aria-label="Lengtegraad" type="number" step="any" placeholder="Lengtegraad" defaultValue={event.longitude ?? ''} className={input}/>
            <input name="radius" aria-label="GPS-radius" type="number" min={10} max={10000} defaultValue={event.checkin_radius_m} className={input}/>
            <button className="rounded-xl bg-violet-600 p-3">Opslaan</button>
          </form>
        </details>

        <details>
          <summary className="cursor-pointer">Event dupliceren</summary>
          <form action={duplicateEvent} className="mt-3 grid gap-2">
            <input type="hidden" name="event_id" value={event.id}/>
            <input name="name" required maxLength={200} defaultValue={`${event.name} — kopie`} className={input}/>
            <DateInput name="start_at"/>
            <DateInput name="end_at"/>
            <button className="rounded-xl border p-3">Configuratie dupliceren</button>
          </form>
        </details>

        {event.status !== 'archived' && <form action={archiveEvent}>
          <input type="hidden" name="event_id" value={event.id}/>
          <button className="rounded-lg border p-2">Archiveren</button>
        </form>}
      </>}
    </article>)}
  </main>
}
