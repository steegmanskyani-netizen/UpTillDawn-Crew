import { createClient } from '@/lib/supabase/crew-server'
import { addWorkplace,assignResponsible,updateWorkplace } from '@/lib/actions/uptilldawn'
import { AdminOnly } from '@/components/auth/admin-only'
import { ManagerOnly } from '@/components/auth/manager-only'
import { redirect } from 'next/navigation'

export const dynamic='force-dynamic'

export default async function Page(){
  const s=await createClient()
  const {data:{user}}=await s.auth.getUser()
  if(!user)return null

  const {data:profile}=await s.from('profiles').select('role,full_name').eq('id',user.id).single()
  const isAdmin=profile?.role==='admin'
  const isResponsible=profile?.role==='responsible_lead'
  const isStaff=profile?.role==='staff'
  if(!isAdmin&&!isResponsible&&!isStaff)redirect('/')

  let events:Array<{id:string;name:string}>=[]
  let workplaces:Array<{
    id:string;event_id:string;name:string;description:string|null;sort_order:number;is_active:boolean;events:{name:string}|null
  }>=[]
  let leads:Array<{id:string;full_name:string|null;event_id:string}>=[]

  if(isAdmin){
    const [{data:eventRows},{data:workplaceRows},{data:leadMemberships}]=await Promise.all([
      s.from('events').select('id,name').neq('status','archived').order('start_at'),
      s.from('workplaces').select('id,event_id,name,description,sort_order,is_active,events(name)').order('sort_order'),
      s.from('event_members').select('event_id,user_id,event_role,profiles(full_name,approved,role)').in('event_role',['responsible_lead','admin']),
    ])
    events=eventRows||[]
    workplaces=workplaceRows||[]
    leads=(leadMemberships||[])
      .filter(row=>row.profiles?.approved&&(row.profiles?.role==='responsible_lead'||row.profiles?.role==='admin'))
      .map(row=>({id:row.user_id,full_name:row.profiles?.full_name||null,event_id:row.event_id}))
    for(const event of events){
      if(!leads.some(person=>person.id===user.id&&person.event_id===event.id)){
        leads.push({id:user.id,full_name:profile?.full_name||'Beheerder',event_id:event.id})
      }
    }
  }else{
    const [{data:ownShifts},{data:ownResponsible}]=await Promise.all([
      s.from('shifts').select('event_id,workplace_id').eq('user_id',user.id).neq('status','cancelled'),
      s.from('responsible_assignments').select('event_id,workplace_id').eq('user_id',user.id),
    ])
    const eventIds=[...new Set([
      ...(ownShifts||[]).map(row=>row.event_id),
      ...(ownResponsible||[]).map(row=>row.event_id),
    ])]
    if(!eventIds.length)redirect('/events')

    const [{data:eventRows},{data:workplaceRows}]=await Promise.all([
      s.from('events').select('id,name').in('id',eventIds).neq('status','archived').gte('end_at','now').order('start_at'),
      s.from('workplaces').select('id,event_id,name,description,sort_order,is_active,events(name)').in('event_id',eventIds).order('sort_order'),
    ])
    events=eventRows||[]
    workplaces=workplaceRows||[]
    if(!events.length||!workplaces.length)redirect('/events')
  }

  return <main className="space-y-5 p-4 md:p-8">
    <div>
      <h1 className="text-3xl font-black">Werkplekken</h1>
      {!isAdmin&&<p className="text-sm text-muted-foreground">
        Alleen werkplekken waarvoor je een concrete rol of dienst hebt toegewezen gekregen zijn zichtbaar.
      </p>}
    </div>

    {(isAdmin||isResponsible)&&<ManagerOnly>
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
    </ManagerOnly>}

    <div className="grid gap-3 md:grid-cols-2">
      {workplaces.map(workplace=><article key={workplace.id} className="rounded-2xl border p-4">
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

        {isAdmin&&<AdminOnly><form action={assignResponsible} className="mt-3 flex gap-2">
          <input type="hidden" name="workplace_id" value={workplace.id}/>
          <select name="user_id" required className="flex-1 rounded-lg border bg-background p-2">
            <option value="">Verantwoordelijke…</option>
            {leads.filter(person=>person.event_id===workplace.event_id).map(person=><option key={person.id} value={person.id}>{person.full_name||'Naam ontbreekt'}</option>)}
          </select>
          <button className="rounded-lg border px-3">Toewijzen</button>
        </form></AdminOnly>}
      </article>)}
    </div>

    {!workplaces.length&&<p className="rounded-xl border p-4 text-muted-foreground">Geen toegewezen werkplekken beschikbaar.</p>}
  </main>
}
