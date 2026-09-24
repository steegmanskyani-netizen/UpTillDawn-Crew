import Link from 'next/link'
import { DateInput } from '@/components/crew/date-input'
import { AdminOnly } from '@/components/auth/admin-only'
import { GeoapifyPlaceFields } from '@/components/events/geoapify-place-fields'
import { DeleteEventButton } from '@/components/events/delete-event-button'
import { nlStatus } from '@/lib/ui-nl'
import { createClient } from '@/lib/supabase/crew-server'
import { getCurrentUser } from '@/lib/actions/auth'
import {
  addWorkplace,
  assignAvailableCrewShift,
  createEvent,
  duplicateEvent,
  setEventAvailability,
  updateEvent,
} from '@/lib/actions/uptilldawn'

export const dynamic = 'force-dynamic'
const input='rounded-lg border bg-background p-3'

export default async function Page(){
  const s=await createClient()
  const user=await getCurrentUser()
  if(!user)return null

  const [eventsResult,membershipResult,shiftResult,startedResult,availabilityResult]=await Promise.all([
    s.from('events').select('id,name,venue,address,start_at,end_at,status,latitude,longitude,checkin_radius_m').order('start_at'),
    s.from('event_members').select('event_id,user_id'),
    s.from('shifts').select('event_id').eq('user_id',user.id).neq('status','cancelled'),
    s.from('events').select('id').lte('start_at','now'),
    s.from('event_availability').select('event_id,user_id,response,updated_at'),
  ])
  const peopleResult=user.isAdmin
    ? await s.from('profiles').select('id,full_name').eq('approved',true).order('full_name')
    : {data:[],error:null}
  const [workplacesResult,adminShiftsResult]=user.isAdmin
    ? await Promise.all([
        s.from('workplaces').select('id,event_id,name,is_active').order('sort_order'),
        s.from('shifts').select('id,event_id,workplace_id,user_id,role_name,scheduled_start,scheduled_end,status').order('scheduled_start'),
      ])
    : [{data:[],error:null},{data:[],error:null}]

  const events=eventsResult.data||[]
  const people=peopleResult.data||[]
  const workplaces=workplacesResult.data||[]
  const adminShifts=adminShiftsResult.data||[]
  const memberships=membershipResult.data||[]
  const availability=availabilityResult.data||[]
  const startedEventIds=new Set((startedResult.data||[]).map(event=>event.id))
  const assignedEventIds=new Set([
    ...memberships.filter(row=>row.user_id===user.id).map(row=>row.event_id),
    ...(shiftResult.data||[]).map(row=>row.event_id),
  ])
  const memberKeys=new Set(memberships.map(row=>`${row.event_id}:${row.user_id}`))
  const peopleById=new Map(people.map(person=>[person.id,person]))

  return <main className="space-y-6 p-4 md:p-8">
    <h1 className="text-3xl font-black">Evenementen</h1>

    {user.isAdmin&&<AdminOnly><form action={createEvent} className="grid gap-3 rounded-2xl border p-4">
      <input name="name" required maxLength={200} placeholder="Evenementnaam" className={input}/>
      <GeoapifyPlaceFields/>
      <div className="grid gap-3 md:grid-cols-3">
        <DateInput name="start_at"/>
        <DateInput name="end_at"/>
        <label className="grid gap-1 text-sm">GPS-radius (m)<input name="radius" type="number" defaultValue="100" min="10" max="10000" className={input}/></label>
      </div>
      <button className="rounded-xl bg-violet-600 p-3 font-bold">EVENEMENT AANMAKEN</button>
    </form></AdminOnly>}

    {eventsResult.error&&<p>Evenementen konden niet worden geladen.</p>}
    {!eventsResult.error&&!events.length&&<p className="rounded-xl border p-4 text-muted-foreground">Geen evenementen beschikbaar.</p>}

    <div className="space-y-3">{events.map(event=>{
      const started=startedEventIds.has(event.id)
      const myResponse=availability.find(row=>row.event_id===event.id&&row.user_id===user.id)?.response
      const canRows=user.isAdmin?availability.filter(row=>row.event_id===event.id&&row.response==='can'):[]
      const eventWorkplaces=user.isAdmin?workplaces.filter(workplace=>workplace.event_id===event.id&&workplace.is_active):[]
      const chatUntil=new Date(new Date(event.end_at).getTime()+3*24*60*60*1000)
      const assigned=assignedEventIds.has(event.id)
      return <details key={event.id} className="rounded-2xl border bg-card">
        <summary className="cursor-pointer list-none p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{event.name}</h2>
              <p className="text-sm text-muted-foreground">{event.venue||'Locatie nog niet ingesteld'} · {new Date(event.start_at).toLocaleString('nl-BE')} · {nlStatus(event.status)}</p>
              {event.address&&<p className="text-xs text-muted-foreground">{event.address}</p>}
            </div>
            {!started&&<span className="rounded-full border px-2 py-1 text-xs font-bold">Toekomstig</span>}
            {started&&assigned&&<span className="rounded-full border px-2 py-1 text-xs font-bold">Toegewezen</span>}
          </div>
        </summary>

        <div className="space-y-4 border-t p-4">
          {!started&&event.status!=='archived'&&<section className="space-y-2">
            <p className="font-semibold">Kan je op dit evenement werken?</p>
            <div className="flex flex-wrap gap-2">
              <form action={setEventAvailability}><input type="hidden" name="event_id" value={event.id}/><input type="hidden" name="response" value="can"/><button className={`rounded-xl border px-4 py-2 font-bold ${myResponse==='can'?'bg-emerald-600 text-white':''}`}>IK KAN</button></form>
              <form action={setEventAvailability}><input type="hidden" name="event_id" value={event.id}/><input type="hidden" name="response" value="cannot"/><button className={`rounded-xl border px-4 py-2 font-bold ${myResponse==='cannot'?'bg-red-600 text-white':''}`}>IK KAN NIET</button></form>
            </div>
          </section>}

          {!user.isAdmin&&started&&assigned&&<div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 text-sm">
            <p className="text-muted-foreground">Na afloop blijft de eventchat beschikbaar tot {chatUntil.toLocaleString('nl-BE')}.</p>
            <Link href="/chat" className="mt-2 inline-block rounded-lg bg-violet-600 px-3 py-2 font-bold text-white">Chats openen</Link>
          </div>}

          {user.isAdmin&&<AdminOnly><div className="space-y-4">
            <section className="space-y-3 rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold">Mensen die kunnen</h3>
                  <p className="text-sm text-muted-foreground">Wijs hier meteen een werkplek, diensturen en functie toe.</p>
                </div>
                <span className="text-sm text-muted-foreground">{canRows.length}</span>
              </div>

              {!eventWorkplaces.length&&<div className="rounded-xl border border-amber-500/40 p-3">
                <p className="text-sm font-semibold">Maak eerst minstens één werkplek voor dit evenement.</p>
                <form action={addWorkplace} className="mt-3 grid gap-2 md:grid-cols-2">
                  <input type="hidden" name="event_id" value={event.id}/>
                  <input name="name" required maxLength={200} placeholder="Nieuwe werkplek" className={input}/>
                  <input name="description" maxLength={1000} placeholder="Omschrijving (optioneel)" className={input}/>
                  <input type="hidden" name="sort_order" value="0"/>
                  <button className="rounded-xl bg-violet-600 px-4 py-3 font-bold text-white md:col-span-2">WERKPLEK TOEVOEGEN</button>
                </form>
              </div>}

              {canRows.length
                ? <div className="space-y-3">{canRows.map(row=>{
                    const person=peopleById.get(row.user_id)
                    const alreadyAdded=memberKeys.has(`${event.id}:${row.user_id}`)
                    const existingShifts=adminShifts.filter(shift=>shift.event_id===event.id&&shift.user_id===row.user_id&&shift.status!=='cancelled')
                    return <article key={row.user_id} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{person?.full_name||row.user_id}</p>
                          <p className="text-xs text-muted-foreground">
                            {alreadyAdded?'Toegevoegd aan evenement':'Nog niet toegewezen'}
                            {existingShifts.length?` · ${existingShifts.length} dienst(en)`:''}
                          </p>
                        </div>
                        <span className="rounded-full border border-emerald-500/50 px-2 py-1 text-xs font-bold text-emerald-600">KAN</span>
                      </div>

                      {existingShifts.length>0&&<div className="mt-2 space-y-1 rounded-lg bg-muted/40 p-2 text-xs">
                        {existingShifts.map(shift=>{
                          const workplace=eventWorkplaces.find(item=>item.id===shift.workplace_id)
                          return <p key={shift.id}>
                            {workplace?.name||'Werkplek'} · {shift.role_name} · {new Date(shift.scheduled_start).toLocaleString('nl-BE')} → {new Date(shift.scheduled_end).toLocaleString('nl-BE')}
                          </p>
                        })}
                      </div>}

                      {eventWorkplaces.length>0&&<form action={assignAvailableCrewShift} className="mt-3 grid gap-2 md:grid-cols-2">
                        <input type="hidden" name="event_id" value={event.id}/>
                        <input type="hidden" name="user_id" value={row.user_id}/>
                        <label className="grid gap-1 text-sm">Werkplek
                          <select name="workplace_id" required className={input}>
                            <option value="">Werkplek kiezen…</option>
                            {eventWorkplaces.map(workplace=><option key={workplace.id} value={workplace.id}>{workplace.name}</option>)}
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm">Rol / functie
                          <input name="role_name" required maxLength={200} placeholder="bv. Ticket Scan, Bar, Artistbegeleiding" className={input}/>
                        </label>
                        <DateInput name="start" initial={event.start_at}/>
                        <DateInput name="end" initial={event.end_at}/>
                        <label className="flex items-center gap-2 text-sm md:col-span-2">
                          <input type="checkbox" name="overlap_allowed"/> Overlappende dienst expliciet toestaan
                        </label>
                        <button className="rounded-xl bg-violet-600 px-4 py-3 font-bold text-white md:col-span-2">
                          {alreadyAdded?'DIENST TOEVOEGEN':'TOEWIJZEN + DIENST AANMAKEN'}
                        </button>
                      </form>}
                    </article>
                  })}</div>
                : <p className="text-sm text-muted-foreground">Nog niemand heeft aangeduid dat die kan.</p>}
            </section>

            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer font-semibold">Alle informatie bewerken</summary>
              <form action={updateEvent} className="mt-3 grid gap-3">
                <input type="hidden" name="event_id" value={event.id}/>
                <input aria-label="Evenementnaam" name="name" required maxLength={200} defaultValue={event.name} className={input}/>
                <GeoapifyPlaceFields defaultVenue={event.venue} defaultAddress={event.address} defaultLatitude={event.latitude} defaultLongitude={event.longitude}/>
                <div className="grid gap-3 md:grid-cols-3">
                  <DateInput name="start_at" initial={event.start_at}/>
                  <DateInput name="end_at" initial={event.end_at}/>
                  <label className="grid gap-1 text-sm">GPS-radius (m)<input name="radius" type="number" min={10} max={10000} defaultValue={event.checkin_radius_m} className={input}/></label>
                </div>
                <button className="rounded-xl bg-violet-600 p-3 font-bold">WIJZIGINGEN OPSLAAN</button>
              </form>
            </details>

            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer font-semibold">Evenement dupliceren</summary>
              <form action={duplicateEvent} className="mt-3 grid gap-2">
                <input type="hidden" name="event_id" value={event.id}/>
                <input name="name" required maxLength={200} defaultValue={`${event.name} — kopie`} className={input}/>
                <DateInput name="start_at"/>
                <DateInput name="end_at"/>
                <button className="rounded-xl border p-3">Configuratie kopiëren</button>
              </form>
            </details>

            <DeleteEventButton eventId={event.id} eventName={event.name}/>
          </div></AdminOnly>}
        </div>
      </details>
    })}</div>
  </main>
}
