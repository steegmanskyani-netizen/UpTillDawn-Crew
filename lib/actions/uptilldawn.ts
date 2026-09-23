'use server'
import { createClient } from '@/lib/supabase/crew-server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const uuid=z.string().uuid()
const text=z.string().trim().min(1).max(200)
async function adminClient(){
 const s=await createClient()
 const {data:{user}}=await s.auth.getUser()
 if(!user) throw new Error('Aanmelden vereist.')
 const {data:p}=await s.from('profiles').select('approved,role').eq('id',user.id).single()
 if(!p?.approved||p.role!=='admin') throw new Error('Geen toegang.')
 return {s,user}
}
function check(error:{code?:string}|null){if(error){console.error('[Crew mutation]',{code:error.code});throw new Error('Opslaan mislukt. Controleer je invoer en probeer opnieuw.')}}
function dates(fd:FormData,start:string,end:string){
 const a=z.string().datetime({offset:true}).parse(fd.get(start)),b=z.string().datetime({offset:true}).parse(fd.get(end))
 if(Date.parse(b)<=Date.parse(a)) throw new Error('Einde moet na begin liggen.')
 return [a,b]
}
export async function createEvent(fd:FormData){
 const {s,user}=await adminClient(); const [start,end]=dates(fd,'start_at','end_at')
 const {error}=await s.from('events').insert({name:text.parse(fd.get('name')),venue:String(fd.get('venue')||'').slice(0,200),address:String(fd.get('address')||'').slice(0,500),start_at:start,end_at:end,start_date:start,end_date:end,checkin_radius_m:z.coerce.number().int().min(10).max(10000).parse(fd.get('radius')||100),created_by:user.id})
 check(error);revalidatePath('/events')
}
export async function addWorkplace(fd:FormData){
 const {s}=await adminClient();const {error}=await s.from('workplaces').insert({event_id:uuid.parse(fd.get('event_id')),name:text.parse(fd.get('name'))});check(error);revalidatePath('/workplaces')
}
export async function addEventMember(fd:FormData){
 const {s}=await adminClient();const user_id=uuid.parse(fd.get('user_id'))
 const {data:p}=await s.from('profiles').select('approved').eq('id',user_id).single();if(!p?.approved)throw new Error('Account niet goedgekeurd.')
 const {error}=await s.from('event_members').upsert({event_id:uuid.parse(fd.get('event_id')),user_id,event_role:'employee'},{onConflict:'event_id,user_id'});check(error);revalidatePath('/events')
}
export async function assignResponsible(fd:FormData){
 const {s,user}=await adminClient();const workplace_id=uuid.parse(fd.get('workplace_id')),user_id=uuid.parse(fd.get('user_id'))
 const {data:p}=await s.from('profiles').select('approved,role').eq('id',user_id).single();if(!p?.approved||!['responsible_lead','admin'].includes(p.role))throw new Error('Selecteer een goedgekeurde Responsible of Admin.')
 const {data:w,error:e}=await s.from('workplaces').select('event_id').eq('id',workplace_id).single();check(e);if(!w)return
 const {error}=await s.from('responsible_assignments').upsert({event_id:w.event_id,workplace_id,user_id,assigned_by:user.id},{onConflict:'workplace_id,user_id'});check(error);revalidatePath('/workplaces')
}
export async function createShift(fd:FormData){
 const {s}=await adminClient();const workplace_id=uuid.parse(fd.get('workplace_id')),user_id=uuid.parse(fd.get('user_id'));const [start,end]=dates(fd,'start','end')
 const {data:w,error:e}=await s.from('workplaces').select('event_id').eq('id',workplace_id).single();check(e);if(!w)return
 const {data:m}=await s.from('event_members').select('id').eq('event_id',w.event_id).eq('user_id',user_id).maybeSingle();if(!m)throw new Error('Voeg deze medewerker eerst toe aan het event.')
 const {error}=await s.from('shifts').insert({event_id:w.event_id,workplace_id,user_id,role_name:text.parse(fd.get('role_name')||'Crew'),scheduled_start:start,scheduled_end:end,start_time:start,end_time:end,overlap_allowed:fd.get('overlap_allowed')==='on'});check(error);revalidatePath('/shifts')
}
export async function setAccountStatus(fd:FormData){
 const {s,user}=await adminClient();const id=uuid.parse(fd.get('user_id'));const approved=fd.get('status')==='approved'
 const role=z.enum(['admin','responsible_lead','staff']).parse(fd.get('role')||'staff')
 if(id===user.id && (!approved||role!=='admin'))throw new Error('Je kunt je eigen admin-toegang hier niet intrekken.')
 const {error}=await s.rpc('upt_admin_set_account',{p_user:id,p_approved:approved,p_role:role});check(error);revalidatePath('/personnel')
}
export async function acknowledgeBriefing(fd:FormData){const s=await createClient();const {error}=await s.rpc('upt_acknowledge_briefing',{p_briefing:uuid.parse(fd.get('id'))});check(error);revalidatePath('/briefings')}
export async function acknowledgeInstruction(fd:FormData){const s=await createClient();const {error}=await s.rpc('upt_acknowledge_personal_instruction',{p_instruction:uuid.parse(fd.get('id'))});check(error);revalidatePath('/briefings')}
export async function createBriefing(fd:FormData){const {s,user}=await adminClient();const {error}=await s.from('briefings').insert({event_id:uuid.parse(fd.get('event_id')),title:text.parse(fd.get('title')),body:z.string().trim().min(1).max(20000).parse(fd.get('body')),created_by:user.id});check(error);revalidatePath('/briefings')}
export async function createPersonalInstruction(fd:FormData){
 const {s,user}=await adminClient()
 const {error}=await s.from('personal_instructions').insert({event_id:uuid.parse(fd.get('event_id')),user_id:uuid.parse(fd.get('user_id')),title:text.parse(fd.get('title')),body:z.string().trim().min(1).max(20000).parse(fd.get('body')),created_by:user.id})
 check(error);revalidatePath('/briefings')
}
export async function updateBriefing(fd:FormData){
 const {s}=await adminClient()
 const {error}=await s.from('briefings').update({title:text.parse(fd.get('title')),body:z.string().trim().min(1).max(20000).parse(fd.get('body'))}).eq('id',uuid.parse(fd.get('id')))
 check(error);revalidatePath('/briefings')
}
export async function updatePersonalInstruction(fd:FormData){
 const {s}=await adminClient()
 const {error}=await s.from('personal_instructions').update({title:text.parse(fd.get('title')),body:z.string().trim().min(1).max(20000).parse(fd.get('body'))}).eq('id',uuid.parse(fd.get('id')))
 check(error);revalidatePath('/briefings')
}
export async function createTask(fd:FormData){const {s}=await adminClient();const {error}=await s.rpc('upt_create_assigned_task',{p_event:uuid.parse(fd.get('event_id')),p_workplace:null as unknown as string,p_user:uuid.parse(fd.get('user_id')),p_title:text.parse(fd.get('title')),p_description:String(fd.get('description')||'').slice(0,4000)});check(error);revalidatePath('/tasks')}
export async function archiveEvent(fd:FormData){const {s}=await adminClient();const {error}=await s.from('events').update({status:'archived'}).eq('id',uuid.parse(fd.get('event_id')));check(error);revalidatePath('/events')}
export async function duplicateEvent(fd:FormData){const {s}=await adminClient();const [start,end]=dates(fd,'start_at','end_at');const {error}=await s.rpc('upt_duplicate_event',{p_event:uuid.parse(fd.get('event_id')),p_name:text.parse(fd.get('name')),p_start:start,p_end:end});check(error);revalidatePath('/events')}
export async function updateEvent(fd:FormData){const {s}=await adminClient();const latitude=fd.get('latitude')?z.coerce.number().min(-90).max(90).parse(fd.get('latitude')):null;const longitude=fd.get('longitude')?z.coerce.number().min(-180).max(180).parse(fd.get('longitude')):null;if((latitude===null)!==(longitude===null))throw new Error('Vul beide coördinaten in.');const {error}=await s.from('events').update({name:text.parse(fd.get('name')),venue:String(fd.get('venue')||'').slice(0,200),latitude,longitude,checkin_radius_m:z.coerce.number().int().min(10).max(10000).parse(fd.get('radius'))}).eq('id',uuid.parse(fd.get('event_id')));check(error);revalidatePath('/events')}
