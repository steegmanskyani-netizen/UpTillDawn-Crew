import { createClient } from '@/lib/supabase/crew-server'
import { getCurrentUser } from '@/lib/actions/auth'
import { redirect } from 'next/navigation'
import OperationsClient from './operations-client'
import type { Tables } from '@/types/crew-database'

export const dynamic='force-dynamic'

export default async function Page(){
  const s=await createClient()
  const current=await getCurrentUser()
  if(!current)redirect('/login')

  const role=current.role
  const isAdmin=role==='admin'
  const manager=isAdmin||role==='responsible_lead'
  const now=new Date().toISOString()

  const {data:activeEvents,error:eventError}=await s.from('events')
    .select('*').lte('start_at',now).gte('end_at',now).neq('status','archived').order('start_at')

  const activeEventIds=(activeEvents||[]).map(event=>event.id)
  if(eventError)return <main className="p-8">Werkgegevens konden niet worden geladen. Probeer opnieuw.</main>
  if(!activeEventIds.length){
    if(!isAdmin)redirect('/events')
    return <main className="p-8">Er is momenteel geen lopend evenement voor operationele status of goedkeuringen.</main>
  }

  const shiftsQuery=s.from('shifts')
    .select('*')
    .eq('user_id',current.id)
    .in('event_id',activeEventIds)
    .neq('status','cancelled')
    .lte('scheduled_start',now)
    .gte('scheduled_end',now)
    .order('scheduled_start')

  const [shifts,workplaces,session,pause,checkins,checkouts]=await Promise.all([
    shiftsQuery,
    s.from('workplaces').select('*').in('event_id',activeEventIds),
    s.from('work_sessions').select('*').eq('user_id',current.id).in('event_id',activeEventIds).is('ended_at',null).maybeSingle(),
    s.from('break_sessions').select('*').eq('user_id',current.id).is('ended_at',null).maybeSingle(),
    s.from('check_ins').select('*').in('event_id',activeEventIds).order('requested_at',{ascending:false}).limit(100),
    s.from('check_outs').select('*').in('event_id',activeEventIds).order('requested_at',{ascending:false}).limit(100),
  ])

  if([shifts,workplaces,session,pause,checkins,checkouts].some(query=>query.error)){
    return <main className="p-8">Werkgegevens konden niet worden geladen. Probeer opnieuw.</main>
  }

  const responsibleScope=!isAdmin&&manager
    ? (await s.from('responsible_assignments').select('event_id,workplace_id').eq('user_id',current.id).in('event_id',activeEventIds)).data||[]
    : []
  const scopedWorkplaceIds=new Set([
    ...(shifts.data||[]).map(shift=>shift.workplace_id),
    ...responsibleScope.map(row=>row.workplace_id),
  ])
  const scopedWorkplaces=isAdmin
    ? (workplaces.data||[])
    : (workplaces.data||[]).filter(workplace=>scopedWorkplaceIds.has(workplace.id))
  const scopedCheckins=isAdmin
    ? (checkins.data||[])
    : manager
      ? (checkins.data||[]).filter(row=>row.user_id===current.id||scopedWorkplaceIds.has(row.workplace_id))
      : (checkins.data||[]).filter(row=>row.user_id===current.id)
  const scopedCheckouts=isAdmin
    ? (checkouts.data||[])
    : manager
      ? (checkouts.data||[]).filter(row=>row.user_id===current.id||Boolean(row.workplace_id&&scopedWorkplaceIds.has(row.workplace_id)))
      : (checkouts.data||[]).filter(row=>row.user_id===current.id)

  const personalWork=!isAdmin&&Boolean(shifts.data?.length)
  if(!manager&&!personalWork&&!current.isEditMode){
    return <main className="p-8">Werk &amp; pauze is zichtbaar vanaf de start van het evenement, maar acties worden bruikbaar vanaf de start van je toegewezen shift.</main>
  }

  const summary=personalWork&&session.data
    ? await s.rpc('upt_work_session_time_summary',{p_work_session:session.data.id})
    : null

  let liveSessions:Tables<'work_sessions'>[]=[]
  let liveBreaks:Tables<'break_sessions'>[]=[]
  let liveShifts:Tables<'shifts'>[]=[]
  let crewDirectory:Array<{id:string;full_name:string|null;phone_number:string|null;profile_photo_url:string|null}>=[]

  if(manager){
    const [sessionsResult,breaksResult,liveShiftsResult]=await Promise.all([
      s.from('work_sessions').select('*').in('event_id',activeEventIds).is('ended_at',null).order('started_at'),
      s.from('break_sessions').select('*').is('ended_at',null).order('started_at'),
      s.from('shifts').select('*').in('event_id',activeEventIds).neq('status','cancelled'),
    ])
    liveShifts=isAdmin
      ? (liveShiftsResult.data||[])
      : (liveShiftsResult.data||[]).filter(shift=>scopedWorkplaceIds.has(shift.workplace_id))
    const liveShiftIds=new Set(liveShifts.map(shift=>shift.id))
    liveSessions=(sessionsResult.data||[]).filter(ws=>Boolean(ws.shift_id&&liveShiftIds.has(ws.shift_id)))
    const liveSessionIds=new Set(liveSessions.map(ws=>ws.id))
    liveBreaks=(breaksResult.data||[]).filter(row=>liveSessionIds.has(row.work_session_id))

    if(isAdmin){
      const {data}=await s.from('profiles').select('id,full_name,phone_number,profile_photo_url').eq('approved',true)
      crewDirectory=data||[]
    }else{
      const rows=await Promise.all(responsibleScope.map(assignment=>
        s.rpc('upt_responsible_crew_directory',{event_uuid:assignment.event_id,workplace_uuid:assignment.workplace_id})
      ))
      const unique=new Map<string,(typeof crewDirectory)[number]>()
      for(const row of rows)for(const member of row.data||[])unique.set(member.id,member)
      crewDirectory=[...unique.values()]
    }
  }

  return <OperationsClient
    userId={current.id}
    shifts={shifts.data||[]}
    events={activeEvents||[]}
    workplaces={scopedWorkplaces}
    activeSession={personalWork?session.data:null}
    activeBreak={personalWork?pause.data:null}
    checkins={scopedCheckins}
    checkouts={scopedCheckouts}
    manager={manager}
    isAdmin={isAdmin}
    personalWork={personalWork}
    summary={summary?.data?.[0]||null}
    summaryAsOf={new Date(now).getTime()}
    liveSessions={liveSessions}
    liveBreaks={liveBreaks}
    liveShifts={liveShifts}
    crewDirectory={crewDirectory}
  />
}
