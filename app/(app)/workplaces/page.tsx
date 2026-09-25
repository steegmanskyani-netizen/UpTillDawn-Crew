import { createClient } from '@/lib/supabase/crew-server'
import { addWorkplace,assignResponsible,demoteResponsibleToStaff,updateWorkplace } from '@/lib/actions/uptilldawn'
import { AdminOnly } from '@/components/auth/admin-only'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/actions/auth'

export const dynamic='force-dynamic'

type Person={id:string;full_name:string|null;role?:string|null}

export default async function Page(){
  const s=await createClient()
  const current=await getCurrentUser()
  if(!current)return null
  const user={id:current.id}

  const isAdmin=current.role==='admin'
  const isResponsible=current.role==='responsible_lead'
  const isStaff=current.role==='staff'
  if(!isAdmin&&!isResponsible&&!isStaff)redirect('/')

  let events:Array<{id:string;name:string}>=[]
  let workplaces:Array<{
    id:string;event_id:string;name:string;description:string|null;sort_order:number;is_active:boolean;events:{name:string}|null
  }>=[]
  let assignedCrew:Array<{
    id:string
    full_name:string|null
    event_id:string
    workplace_id:string
    role_name:string
  }>=[]
  let responsibleAssignments:Array<{workplace_id:string;user_id:string}>=[]
  let peopleById=new Map<string,Person>()

  if(isAdmin){
    const [
      {data:eventRows},
      {data:workplaceRows},
      {data:shiftRows},
      {data:profileRows},
      {data:responsibleRows},
    ]=await Promise.all([
      s.from('events').select('id,name').neq('status','archived').order('start_at'),
      s.from('workplaces').select('id,event_id,name,description,sort_order,is_active,events(name)').order('sort_order'),
      s.from('shifts').select('event_id,workplace_id,user_id,role_name,status').neq('status','cancelled').order('scheduled_start'),
      s.from('profiles').select('id,full_name,role').eq('approved',true).order('full_name'),
      s.from('responsible_assignments').select('workplace_id,user_id'),
    ])
    events=eventRows||[]
    workplaces=workplaceRows||[]
    peopleById=new Map((profileRows||[]).map(person=>[person.id,person]))
    responsibleAssignments=responsibleRows||[]
    const seen=new Set<string>()
    assignedCrew=(shiftRows||[]).flatMap(shift=>{
      const person=peopleById.get(shift.user_id)
      const key=`${shift.workplace_id}:${shift.user_id}`
      if(!person||seen.has(key))return []
      seen.add(key)
      return [{
        id:shift.user_id,
        full_name:person.full_name,
        event_id:shift.event_id,
        workplace_id:shift.workplace_id,
        role_name:shift.role_name,
      }]
    })
  }else{
    const [{data:ownShifts},{data:ownResponsible},{data:ownMemberships}]=await Promise.all([
      s.from('shifts').select('event_id,workplace_id').eq('user_id',user.id).neq('status','cancelled'),
      s.from('responsible_assignments').select('event_id,workplace_id').eq('user_id',user.id),
      s.from('event_members').select('event_id,event_role').eq('user_id',user.id),
    ])
    const eventIds=[...new Set([
      ...(ownShifts||[]).map(row=>row.event_id),
      ...(ownResponsible||[]).map(row=>row.event_id),
      ...(ownMemberships||[])
        .filter(row=>isResponsible&&['responsible_lead','admin'].includes(row.event_role))
        .map(row=>row.event_id),
    ])]
    if(!eventIds.length)redirect('/events')

    const [{data:eventRows},{data:workplaceRows}]=await Promise.all([
      s.from('events').select('id,name').in('id',eventIds).neq('status','archived').gte('end_at','now').order('start_at'),
      s.from('workplaces').select('id,event_id,name,description,sort_order,is_active,events(name)').in('event_id',eventIds).order('sort_order'),
    ])
    events=eventRows||[]
    workplaces=workplaceRows||[]
    if(!events.length||!workplaces.length)redirect('/events')

    if(isResponsible){
      const [{data:shiftRows},{data:responsibleRows},...memberResults]=await Promise.all([
        s.from('shifts').select('event_id,workplace_id,user_id,role_name,status').in('event_id',eventIds).neq('status','cancelled').order('scheduled_start'),
        s.from('responsible_assignments').select('event_id,workplace_id,user_id').in('event_id',eventIds),
        ...eventIds.map(eventId=>s.rpc('upt_responsible_event_members',{p_event:eventId,p_workplace:null as unknown as string})),
      ])
      const people=new Map<string,Person>()
      for(const result of memberResults){
        for(const person of result.data||[])people.set(person.id,{id:person.id,full_name:person.full_name,role:null})
      }
      peopleById=people
      responsibleAssignments=(responsibleRows||[]).map(row=>({workplace_id:row.workplace_id,user_id:row.user_id}))
      const seen=new Set<string>()
      assignedCrew=(shiftRows||[]).flatMap(shift=>{
        const person=peopleById.get(shift.user_id)
        const key=`${shift.workplace_id}:${shift.user_id}`
        if(!person||seen.has(key))return []
        seen.add(key)
        return [{
          id:shift.user_id,
          full_name:person.full_name,
          event_id:shift.event_id,
          workplace_id:shift.workplace_id,
          role_name:shift.role_name,
        }]
      })
    }
  }

  const responsibleKeys=new Set(responsibleAssignments.map(row=>`${row.workplace_id}:${row.user_id}`))

  return <main className="space-y-5 p-4 md:p-8">
    <div>
      <h1 className="text-3xl font-black">Werkplekken</h1>
      {isResponsible
        ? <p className="text-sm text-muted-foreground">Alleen-lezen: bekijk per werkplek wie er ingepland is en wie verantwoordelijk is. Werkplekken beheren kan alleen als beheerder.</p>
        : !isAdmin&&<p className="text-sm text-muted-foreground">Alleen werkplekken waarvoor je een concrete rol of dienst hebt toegewezen gekregen zijn zichtbaar.</p>}
    </div>

    {isAdmin&&<AdminOnly>
      <form action={addWorkplace} className="grid gap-2 rounded-2xl border p-4 md:grid-cols-2">
        <select name="event_id" required className="rounded-lg border bg-background p-3">
          <option value="">Evenement…</option>
          {events.map(event=><option key={event.id} value={event.id}>{event.name}</option>)}
        </select>
        <input name="name" required maxLength={200} placeholder="Nieuwe werkplek" className="rounded-lg border bg-background p-3"/>
        <input name="description" maxLength={1000} placeholder="Omschrijving (optioneel)" className="rounded-lg border bg-background p-3"/>
        <input name="sort_order" type="number" min="0" max="10000" defaultValue="0" aria-label="Volgorde" className="rounded-lg border bg-background p-3"/>
        <button className="rounded-lg bg-violet-600 px-4 py-3 font-bold md:col-span-2">WERKPLEK TOEVOEGEN</button>
      </form>
    </AdminOnly>}

    <div className="grid gap-3 md:grid-cols-2">
      {workplaces.map(workplace=>{
        const crew=assignedCrew.filter(person=>person.workplace_id===workplace.id)
        const responsiblePeople=responsibleAssignments
          .filter(row=>row.workplace_id===workplace.id)
          .map(row=>peopleById.get(row.user_id))
          .filter((person):person is Person=>Boolean(person))
        return <article key={workplace.id} className="rounded-2xl border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <b>{workplace.name}</b>
              <p className="text-sm text-muted-foreground">{workplace.events?.name}</p>
              {workplace.description&&<p className="mt-1 text-sm text-muted-foreground">{workplace.description}</p>}
            </div>
            <span className="rounded-full border px-2 py-1 text-xs">{workplace.is_active?'ACTIEF':'INACTIEF'}</span>
          </div>

          {isAdmin&&<AdminOnly>
            <details className="mt-3 rounded-xl border p-3">
              <summary className="cursor-pointer font-semibold">Werkplek bewerken</summary>
              <form action={updateWorkplace} className="mt-3 grid gap-2">
                <input type="hidden" name="workplace_id" value={workplace.id}/>
                <input name="name" required maxLength={200} defaultValue={workplace.name} className="rounded-lg border bg-background p-2"/>
                <textarea name="description" maxLength={1000} defaultValue={workplace.description||''} placeholder="Omschrijving (optioneel)" className="rounded-lg border bg-background p-2"/>
                <input name="sort_order" type="number" min="0" max="10000" defaultValue={workplace.sort_order} aria-label="Volgorde" className="rounded-lg border bg-background p-2"/>
                <label className="flex items-center gap-2 text-sm"><input name="is_active" type="checkbox" defaultChecked={workplace.is_active}/>Actief</label>
                <button className="rounded-lg border px-3 py-2 font-semibold">WIJZIGINGEN OPSLAAN</button>
              </form>
            </details>
          </AdminOnly>}

          {(isAdmin||isResponsible)&&<div className="mt-3 space-y-3">
            <section className="rounded-xl border p-3">
              <p className="font-semibold">Verantwoordelijke</p>
              {responsiblePeople.length
                ? <div className="mt-2 space-y-2">{responsiblePeople.map(person=>
                    <div key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-500/30 p-2">
                      <span className="font-semibold">
                        {person.full_name||'Naam ontbreekt'}{person.id===user.id?' (jij)':''}
                      </span>
                      {isAdmin&&person.role==='responsible_lead'&&<AdminOnly>
                        <form action={demoteResponsibleToStaff}>
                          <input type="hidden" name="workplace_id" value={workplace.id}/>
                          <input type="hidden" name="user_id" value={person.id}/>
                          <button className="rounded-lg border px-3 py-2 text-xs font-bold">PERSONEEL MAKEN</button>
                        </form>
                      </AdminOnly>}
                    </div>
                  )}</div>
                : <p className="mt-2 text-sm text-muted-foreground">Nog geen verantwoordelijke toegewezen.</p>}
            </section>

            <section className="rounded-xl border p-3">
              <p className="font-semibold">Personeel op deze werkplek</p>
              {crew.length
                ? <div className="mt-2 space-y-2">{crew.map(person=>{
                    const responsible=responsibleKeys.has(`${workplace.id}:${person.id}`)
                    return <div key={person.id} className="flex items-center justify-between gap-3 rounded-lg border p-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{person.full_name||'Naam ontbreekt'}{person.id===user.id?' (jij)':''}</p>
                        <p className="text-xs text-muted-foreground">{person.role_name}</p>
                      </div>
                      {responsible&&<span className="rounded-full border border-violet-500/50 px-2 py-1 text-xs font-bold">VERANTWOORDELIJKE</span>}
                    </div>
                  })}</div>
                : <p className="mt-2 text-sm text-muted-foreground">Nog niemand ingepland op deze werkplek.</p>}
            </section>

            {isAdmin&&crew.length>0&&<AdminOnly><form action={assignResponsible} className="flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="workplace_id" value={workplace.id}/>
              <select name="user_id" required className="min-w-0 flex-1 rounded-lg border bg-background p-2">
                <option value="">Kies toegewezen persoon…</option>
                {crew.map(person=>{
                  const responsible=responsibleKeys.has(`${workplace.id}:${person.id}`)
                  return <option key={person.id} value={person.id} disabled={responsible}>
                    {person.full_name||'Naam ontbreekt'}{person.id===user.id?' (jij)':''}{responsible?' — al verantwoordelijk':''}
                  </option>
                })}
              </select>
              <button className="rounded-lg border px-3 py-2 font-semibold">VERANTWOORDELIJKHEID TOEWIJZEN</button>
            </form></AdminOnly>}
          </div>}
        </article>
      })}
    </div>

    {!workplaces.length&&<p className="rounded-xl border p-4 text-muted-foreground">Geen toegewezen werkplekken beschikbaar.</p>}
  </main>
}
