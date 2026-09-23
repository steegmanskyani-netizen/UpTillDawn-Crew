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
async function approvedClient(){
 const s=await createClient()
 const {data:{user}}=await s.auth.getUser()
 if(!user) throw new Error('Aanmelden vereist.')
 const {data:profile}=await s.from('profiles').select('approved,role').eq('id',user.id).single()
 if(!profile?.approved) throw new Error('ACCOUNT NOG NIET GOEDGEKEURD')
 return {s,user,profile}
}
function check(error:{code?:string}|null){if(error){console.error('[Crew mutation]',{code:error.code});throw new Error('Opslaan mislukt. Controleer je invoer en probeer opnieuw.')}}
function requireManager(role:string){if(!['admin','responsible_lead'].includes(role))throw new Error('Geen toegang.')}

type WorkPhotoTarget = { type: 'briefing' | 'instruction' | 'task'; id: string }
const photoTypes = new Map([
 ['image/jpeg','jpg'],
 ['image/png','png'],
 ['image/webp','webp'],
])

function workPhotoFiles(fd: FormData) {
 const files=fd.getAll('photos').filter((value): value is File => value instanceof File && value.size > 0)
 if(files.length>5) throw new Error('Je kunt maximaal 5 foto’s toevoegen.')
 for(const file of files){
  if(file.size>10*1024*1024) throw new Error('Elke foto mag maximaal 10 MB zijn.')
  if(!photoTypes.has(file.type)) throw new Error('Gebruik alleen JPG-, PNG- of WEBP-foto’s.')
 }
 return files
}

async function rollbackWorkPhotos(s:Awaited<ReturnType<typeof createClient>>,paths:string[]){
 if(!paths.length)return
 await s.from('work_attachments').delete().in('storage_path',paths)
 await s.storage.from('work-media').remove(paths)
}

async function uploadWorkPhotos(
 s:Awaited<ReturnType<typeof createClient>>,
 userId:string,
 target:WorkPhotoTarget,
 files:File[],
){
 if(!files.length)return [] as string[]
 const key=target.type==='briefing'?'briefing_id':target.type==='instruction'?'personal_instruction_id':'task_id'
 const {count,error:countError}=await s.from('work_attachments').select('id',{count:'exact',head:true}).eq(key,target.id)
 check(countError)
 if((count??0)+files.length>5) throw new Error('Per item kun je maximaal 5 foto’s bewaren.')

 const uploaded:string[]=[]
 try{
  for(const file of files){
   const ext=photoTypes.get(file.type)!
   const storagePath=`${userId}/${target.type}/${target.id}/${crypto.randomUUID()}.${ext}`
   const {error:uploadError}=await s.storage.from('work-media').upload(storagePath,file,{contentType:file.type,upsert:false})
   if(uploadError) throw new Error('Foto uploaden mislukt.')
   uploaded.push(storagePath)

   const parent=target.type==='briefing'
    ? {briefing_id:target.id}
    : target.type==='instruction'
      ? {personal_instruction_id:target.id}
      : {task_id:target.id}
   const {error:attachmentError}=await s.from('work_attachments').insert({
    ...parent,
    storage_path:storagePath,
    mime_type:file.type,
    uploaded_by:userId,
   })
   if(attachmentError) throw new Error('Foto koppelen mislukt.')
  }
  return uploaded
 }catch(error){
  await rollbackWorkPhotos(s,uploaded)
  throw error
 }
}
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
 const {data:p}=await s.from('profiles').select('approved,role').eq('id',user_id).single();if(!p?.approved||!['responsible_lead','admin'].includes(p.role))throw new Error('Selecteer een goedgekeurde verantwoordelijke of beheerder.')
 const {data:w,error:e}=await s.from('workplaces').select('event_id').eq('id',workplace_id).single();check(e);if(!w)return
 const {error}=await s.from('responsible_assignments').upsert({event_id:w.event_id,workplace_id,user_id,assigned_by:user.id},{onConflict:'workplace_id,user_id'});check(error);revalidatePath('/workplaces')
}
export async function createShift(fd:FormData){
 const {s}=await approvedClient()
 const [start,end]=dates(fd,'start','end')
 const {error}=await s.rpc('upt_create_shift',{
  p_workplace:uuid.parse(fd.get('workplace_id')),
  p_user:uuid.parse(fd.get('user_id')),
  p_role_name:text.parse(fd.get('role_name')||'Personeel'),
  p_start:start,
  p_end:end,
  p_overlap_allowed:fd.get('overlap_allowed')==='on',
 })
 check(error);revalidatePath('/shifts');revalidatePath('/operations')
}
export async function updateShift(fd:FormData){
 const {s}=await approvedClient()
 const [start,end]=dates(fd,'start','end')
 const {error}=await s.rpc('upt_update_shift',{
  p_shift:uuid.parse(fd.get('shift_id')),
  p_role_name:text.parse(fd.get('role_name')||'Personeel'),
  p_start:start,
  p_end:end,
  p_overlap_allowed:fd.get('overlap_allowed')==='on',
 })
 check(error);revalidatePath('/shifts');revalidatePath('/operations')
}
export async function cancelShift(fd:FormData){
 const {s}=await approvedClient()
 const reason=String(fd.get('reason')||'').trim().slice(0,500)
 const {error}=await s.rpc('upt_cancel_shift',{p_shift:uuid.parse(fd.get('shift_id')),...(reason?{p_reason:reason}:{})})
 check(error);revalidatePath('/shifts');revalidatePath('/operations')
}
export async function setAccountStatus(fd:FormData){
 const {s,user}=await adminClient();const id=uuid.parse(fd.get('user_id'));const status=z.enum(['pending','approved']).parse(fd.get('status'));const approved=status==='approved'
 const role=z.enum(['admin','responsible_lead','staff']).parse(fd.get('role')||'staff')
 if(id===user.id && (!approved||role!=='admin'))throw new Error('Je kunt je eigen beheerderstoegang hier niet intrekken.')
 const {error}=await s.rpc('upt_admin_set_account',{p_user:id,p_approved:approved,p_role:role});check(error);revalidatePath('/personnel')
}
export async function acknowledgeBriefing(fd:FormData){const s=await createClient();const {error}=await s.rpc('upt_acknowledge_briefing',{p_briefing:uuid.parse(fd.get('id'))});check(error);revalidatePath('/briefings')}
export async function acknowledgeInstruction(fd:FormData){const s=await createClient();const {error}=await s.rpc('upt_acknowledge_personal_instruction',{p_instruction:uuid.parse(fd.get('id'))});check(error);revalidatePath('/briefings')}
export async function createBriefing(fd:FormData){
 const {s,user,profile}=await approvedClient()
 requireManager(profile.role)
 const files=workPhotoFiles(fd)
 const eventId=uuid.parse(fd.get('event_id'))
 const rawWorkplace=String(fd.get('workplace_id')||'').trim()
 const workplaceId=rawWorkplace?uuid.parse(rawWorkplace):null
 if(profile.role==='responsible_lead'&&!workplaceId)throw new Error('Kies een toegewezen werkplek.')
 const {data,error}=await s.from('briefings').insert({
  event_id:eventId,
  workplace_id:workplaceId,
  title:text.parse(fd.get('title')),
  body:z.string().trim().min(1).max(20000).parse(fd.get('body')),
  created_by:user.id,
 }).select('id').single()
 check(error);if(!data)throw new Error('Instructie kon niet worden aangemaakt.')
 try{await uploadWorkPhotos(s,user.id,{type:'briefing',id:data.id},files)}
 catch(error){await s.from('briefings').delete().eq('id',data.id);throw error}
 revalidatePath('/briefings')
}
export async function createPersonalInstruction(fd:FormData){
 const {s,user,profile}=await approvedClient()
 requireManager(profile.role)
 const files=workPhotoFiles(fd)
 const eventId=uuid.parse(fd.get('event_id'))
 const rawWorkplace=String(fd.get('workplace_id')||'').trim()
 const workplaceId=rawWorkplace?uuid.parse(rawWorkplace):null
 if(profile.role==='responsible_lead'&&!workplaceId)throw new Error('Kies een toegewezen werkplek.')
 const {data,error}=await s.from('personal_instructions').insert({
  event_id:eventId,
  workplace_id:workplaceId,
  user_id:uuid.parse(fd.get('user_id')),
  title:text.parse(fd.get('title')),
  body:z.string().trim().min(1).max(20000).parse(fd.get('body')),
  created_by:user.id,
 }).select('id').single()
 check(error);if(!data)throw new Error('Persoonlijke instructie kon niet worden aangemaakt.')
 try{await uploadWorkPhotos(s,user.id,{type:'instruction',id:data.id},files)}
 catch(error){await s.from('personal_instructions').delete().eq('id',data.id);throw error}
 revalidatePath('/briefings')
}
export async function updateBriefing(fd:FormData){
 const {s,user,profile}=await approvedClient()
 requireManager(profile.role)
 const id=uuid.parse(fd.get('id'))
 const files=workPhotoFiles(fd)
 const paths=await uploadWorkPhotos(s,user.id,{type:'briefing',id},files)
 const {error}=await s.from('briefings').update({
  title:text.parse(fd.get('title')),
  body:z.string().trim().min(1).max(20000).parse(fd.get('body')),
 }).eq('id',id)
 if(error){await rollbackWorkPhotos(s,paths);check(error)}
 revalidatePath('/briefings')
}
export async function updatePersonalInstruction(fd:FormData){
 const {s,user,profile}=await approvedClient()
 requireManager(profile.role)
 const id=uuid.parse(fd.get('id'))
 const files=workPhotoFiles(fd)
 const paths=await uploadWorkPhotos(s,user.id,{type:'instruction',id},files)
 const {error}=await s.from('personal_instructions').update({
  title:text.parse(fd.get('title')),
  body:z.string().trim().min(1).max(20000).parse(fd.get('body')),
 }).eq('id',id)
 if(error){await rollbackWorkPhotos(s,paths);check(error)}
 revalidatePath('/briefings')
}
export async function createTask(fd:FormData){
 const {s,user,profile}=await approvedClient()
 const files=workPhotoFiles(fd)
 const rawWorkplace=String(fd.get('workplace_id')||'').trim()
 let eventId:string
 let workplaceId:string|null=null
 if(rawWorkplace){
  workplaceId=uuid.parse(rawWorkplace)
  const {data:w,error:wError}=await s.from('workplaces').select('event_id').eq('id',workplaceId).single()
  check(wError);if(!w)throw new Error('Werkplek niet gevonden.')
  eventId=w.event_id
 }else{
  if(profile.role!=='admin')throw new Error('Verantwoordelijke kan alleen taken voor de eigen werkplek aanmaken.')
  eventId=uuid.parse(fd.get('event_id'))
 }
 const {data:taskId,error}=await s.rpc('upt_create_assigned_task',{
  p_event:eventId,
  p_workplace:workplaceId as unknown as string,
  p_user:uuid.parse(fd.get('user_id')),
  p_title:text.parse(fd.get('title')),
  p_description:String(fd.get('description')||'').slice(0,4000),
 })
 check(error);if(!taskId)throw new Error('Taak kon niet worden aangemaakt.')
 try{await uploadWorkPhotos(s,user.id,{type:'task',id:taskId},files)}
 catch(error){await s.from('tasks').delete().eq('id',taskId);throw error}
 revalidatePath('/tasks')
}
export async function removeTaskAssignment(fd:FormData){
 const {s}=await approvedClient()
 const {error}=await s.rpc('upt_remove_task_assignment',{p_assignment:uuid.parse(fd.get('assignment_id'))})
 check(error);revalidatePath('/tasks')
}
export async function markNotificationRead(fd:FormData){
 const s=await createClient()
 const {error}=await s.rpc('upt_mark_notification_read',{p_notification:uuid.parse(fd.get('notification_id'))})
 check(error);revalidatePath('/notifications')
}
export async function archiveEvent(fd:FormData){const {s}=await adminClient();const {error}=await s.from('events').update({status:'archived'}).eq('id',uuid.parse(fd.get('event_id')));check(error);revalidatePath('/events')}
export async function duplicateEvent(fd:FormData){const {s}=await adminClient();const [start,end]=dates(fd,'start_at','end_at');const {error}=await s.rpc('upt_duplicate_event',{p_event:uuid.parse(fd.get('event_id')),p_name:text.parse(fd.get('name')),p_start:start,p_end:end});check(error);revalidatePath('/events')}
export async function updateEvent(fd:FormData){const {s}=await adminClient();const latitude=fd.get('latitude')?z.coerce.number().min(-90).max(90).parse(fd.get('latitude')):null;const longitude=fd.get('longitude')?z.coerce.number().min(-180).max(180).parse(fd.get('longitude')):null;if((latitude===null)!==(longitude===null))throw new Error('Vul beide coördinaten in.');const {error}=await s.from('events').update({name:text.parse(fd.get('name')),venue:String(fd.get('venue')||'').slice(0,200),latitude,longitude,checkin_radius_m:z.coerce.number().int().min(10).max(10000).parse(fd.get('radius'))}).eq('id',uuid.parse(fd.get('event_id')));check(error);revalidatePath('/events')}
