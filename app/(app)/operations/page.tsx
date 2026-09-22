import { createClient } from '@/lib/supabase/crew-server'
import { redirect } from 'next/navigation'
import OperationsClient from './operations-client'
export const dynamic='force-dynamic'
export default async function Page(){
 const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect('/login')
 const queries=await Promise.all([
 s.from('shifts').select('*').eq('user_id',user.id).neq('status','cancelled').order('scheduled_start'),
 s.from('events').select('*').neq('status','archived').order('start_at'),
 s.from('workplaces').select('*'),
 s.from('work_sessions').select('*').eq('user_id',user.id).is('ended_at',null).maybeSingle(),
 s.from('break_sessions').select('*').eq('user_id',user.id).is('ended_at',null).maybeSingle(),
 s.from('check_ins').select('*').order('requested_at',{ascending:false}).limit(100),
 s.from('check_outs').select('*').order('requested_at',{ascending:false}).limit(100),
 s.from('profiles').select('role').eq('id',user.id).single()
 ])
 if(queries.some(q=>q.error))return <main className="p-8">Werkgegevens konden niet worden geladen. Probeer opnieuw.</main>
 const [shifts,events,workplaces,session,pause,checkins,checkouts,profile]=queries
 const summary=session.data?await s.rpc('upt_work_session_time_summary',{p_work_session:session.data.id}):null
 return <OperationsClient userId={user.id} shifts={shifts.data||[]} events={events.data||[]} workplaces={workplaces.data||[]} activeSession={session.data} activeBreak={pause.data} checkins={checkins.data||[]} checkouts={checkouts.data||[]} manager={profile.data?.role!=='staff'} summary={summary?.data?.[0]||null}/>
}
