'use server'
import { createClient } from '@/lib/supabase/crew-server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { geocodeGeoapify } from '@/lib/geoapify'
import { fetchFacebookEventInfo } from '@/lib/facebook-event'
const uuid=z.string().uuid()
const text=z.string().trim().min(1).max(200)
async function adminClient(){
 const s=await createClient()
 const {data:{user}}=await s.auth.getUser()
 if(!user) throw new Error('Aanmelden vereist.')
 const [{data:isApproved},{data:hasAdminPrivilege}]=await Promise.all([
  s.rpc('upt_is_approved'),
  s.rpc('upt_is_admin',{uid:user.id}),
 ])
 if(!isApproved||!hasAdminPrivilege) throw new Error('Geen toegang.')
 return {s,user}
}
async function approvedClient(){
 const s=await createClient()
 const {data:{user}}=await s.auth.getUser()
 if(!user) throw new Error('Aanmelden vereist.')
 const {data:profile}=await s.from('profiles').select('approved,role').eq('id',user.id).single()
 if(!profile?.approved) throw new Error('ACCOUNT NOG NIET GOEDGEKEURD')
 const {data:effectiveRole}=await s.rpc('upt_current_effective_role')
 return {s,user,profile:{...profile,role:effectiveRole||profile.role}}
}
function check(error:{code?:string}|null){if(error){console.error('[Crew mutation]',{code:error.code});throw new Error('Opslaan mislukt. Controleer je invoer en probeer opnieuw.')}}
function requireManager(role:string){if(!['admin','responsible_lead'].includes(role))throw new Error('Geen toegang.')}
async function requireEventManager(
 s: Awaited<ReturnType<typeof createClient>>,
 userId: string,
 role: string,
 eventId: string,
){
 if(role==='admin')return
 if(role!=='responsible_lead')throw new Error('Geen toegang.')
 const {data,error}=await s.from('event_members')
  .select('event_id')
  .eq('event_id',eventId)
  .eq('user_id',userId)
  .in('event_role',['responsible_lead','admin'])
  .maybeSingle()
 check(error)
 if(!data)throw new Error('Je bent niet als verantwoordelijke aan dit evenement toegewezen.')
}
async function requireFeature(
 s: Awaited<ReturnType<typeof createClient>>,
 role: string,
 feature: string,
 eventId: string | null,
 workplaceId: string | null = null,
){
 if(role==='admin')return
 const {data,error}=await s.rpc('upt_feature_allowed',{
  p_feature:feature,
  p_event:eventId ?? undefined,
  p_workplace:workplaceId ?? undefined,
 })
 if(error||!data)throw new Error('Deze functie is voor jouw rol op dit moment niet beschikbaar.')
}
type WorkPhotoTarget = { type: 'briefing' | 'instruction' | 'task'; id: string }
const photoTypes = new Map([
 ['image/jpeg','jpg'],
 ['image/png','png'],
 ['image/webp','webp'],
 ['video/mp4','mp4'],
 ['video/webm','webm'],
 ['video/quicktime','mov'],
 ['application/pdf','pdf'],
 ['text/plain','txt'],
 ['text/csv','csv'],
 ['application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx'],
 ['application/vnd.openxmlformats-officedocument.presentationml.presentation','pptx'],
 ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','xlsx'],
])
function workPhotoFiles(fd: FormData) {
 const files=[
  ...fd.getAll('photos'),
  fd.get('briefing_document'),
 ].filter((value): value is File => value instanceof File && value.size > 0)
 if(files.length>6) throw new Error('Je kunt maximaal 6 bijlagen toevoegen.')
 for(const file of files){
  const isVideo=file.type.startsWith('video/')
  const isImage=file.type.startsWith('image/')
  const max=isVideo?50*1024*1024:isImage?10*1024*1024:20*1024*1024
  if(file.size>max){
   throw new Error(
    isVideo
     ? 'Elke video mag maximaal 50 MB zijn.'
     : isImage
       ? 'Elke afbeelding mag maximaal 10 MB zijn.'
       : 'Elk document mag maximaal 20 MB zijn.'
   )
  }
  if(!photoTypes.has(file.type)){
   throw new Error('Gebruik alleen PDF, DOCX, PPTX, XLSX, TXT, CSV, JPG, PNG, WEBP, MP4, WEBM of MOV.')
  }
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
 if((count??0)+files.length>10) throw new Error('Per briefing kun je maximaal 10 bijlagen bewaren.')
 const uploaded:string[]=[]
 try{
  for(const file of files){
   const ext=photoTypes.get(file.type)!
   const storagePath=`${userId}/${target.type}/${target.id}/${crypto.randomUUID()}.${ext}`
   const {error:uploadError}=await s.storage.from('work-media').upload(storagePath,file,{contentType:file.type,upsert:false})
   if(uploadError) throw new Error('Media uploaden mislukt.')
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
   if(attachmentError) throw new Error('Media koppelen mislukt.')
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
async function eventLocation(fd:FormData,override?:{venue?:string|null;address?:string|null}){
 let venue=String(override?.venue??fd.get('venue')??'').trim().slice(0,200)
 let address=String(override?.address??fd.get('address')??'').trim().slice(0,500)
 const rawLatitude=override?.address||override?.venue?'':String(fd.get('latitude')||'').trim()
 const rawLongitude=override?.address||override?.venue?'':String(fd.get('longitude')||'').trim()
 let latitude=rawLatitude?z.coerce.number().min(-90).max(90).parse(rawLatitude):null
 let longitude=rawLongitude?z.coerce.number().min(-180).max(180).parse(rawLongitude):null
 if((latitude===null)!==(longitude===null)){
  throw new Error('Selecteer een geldige locatie of adres uit de suggesties.')
 }
 if(latitude===null&&longitude===null&&(address||venue)){
  const resolved=await geocodeGeoapify(address||venue)
  if(!resolved)throw new Error('Geen geldige locatie gevonden. Kies een locatie of adres uit de suggesties.')
  latitude=resolved.latitude
  longitude=resolved.longitude
  address=resolved.formatted
  if(!venue)venue=resolved.name
 }
 return {venue,address,latitude,longitude}
}
function optionalIso(fd:FormData,name:string){
 const raw=String(fd.get(name)||'').trim()
 return raw?z.string().datetime({offset:true}).parse(raw):null
}
export async function createEvent(fd:FormData){
 const {s,user}=await adminClient()
 const facebookUrl=String(fd.get('facebook_event_url')||'').trim()
 const imported=facebookUrl?await fetchFacebookEventInfo(facebookUrl):null
 const manualName=String(fd.get('name')||'').trim()
 const name=text.parse(imported?.name||manualName)
 const start=imported?.startAt||optionalIso(fd,'start_at')
 const end=imported?.endAt||optionalIso(fd,'end_at')
 if(!start||!end)throw new Error('Vul start- en einduur in wanneer Facebook deze niet openbaar meegeeft.')
 if(Date.parse(end)<=Date.parse(start))throw new Error('Einde moet na begin liggen.')
 const location=await eventLocation(fd,{
  venue:imported?.venue||undefined,
  address:imported?.address||undefined,
 })
 const {error}=await s.from('events').insert({
  name,
  venue:location.venue,
  address:location.address,
  latitude:location.latitude,longitude:location.longitude,
  start_at:start,end_at:end,start_date:start,end_date:end,
  facebook_event_url:facebookUrl?(imported?.sourceUrl||facebookUrl):null,
  checkin_radius_m:z.coerce.number().int().min(10).max(10000).parse(fd.get('radius')||100),
  created_by:user.id,
 })
 check(error);revalidatePath('/events')
}
export async function addWorkplace(fd:FormData){
 const {s}=await adminClient()
 const eventId=uuid.parse(fd.get('event_id'))
 const {error}=await s.from('workplaces').insert({
  event_id:eventId,
  name:text.parse(fd.get('name')),
  description:String(fd.get('description')||'').trim().slice(0,1000)||null,
  sort_order:z.coerce.number().int().min(0).max(10000).parse(fd.get('sort_order')||0),
  is_active:true,
 })
 check(error);revalidatePath('/workplaces')
}
export async function updateWorkplace(fd:FormData){
 const {s}=await adminClient()
 const workplaceId=uuid.parse(fd.get('workplace_id'))
 const {data:workplace,error:workplaceError}=await s.from('workplaces').select('event_id').eq('id',workplaceId).single()
 check(workplaceError);if(!workplace)throw new Error('Werkplek niet gevonden.')
 const {error}=await s.from('workplaces').update({
  name:text.parse(fd.get('name')),
  description:String(fd.get('description')||'').trim().slice(0,1000)||null,
  sort_order:z.coerce.number().int().min(0).max(10000).parse(fd.get('sort_order')||0),
  is_active:fd.get('is_active')==='on',
 }).eq('id',workplaceId)
 check(error);revalidatePath('/workplaces')
}
export async function setEventAvailability(fd:FormData){
 const {s}=await approvedClient()
 const eventId=uuid.parse(fd.get('event_id'))
 const response=z.enum(['can','cannot']).parse(fd.get('response'))
 const setup=z.enum(['yes','no']).parse(fd.get('setup_available'))==='yes'
 const breakdown=z.enum(['yes','no']).parse(fd.get('breakdown_available'))==='yes'
 const {error}=await s.rpc('upt_set_event_availability_extended',{
  p_event:eventId,
  p_response:response,
  p_setup:setup,
  p_breakdown:breakdown,
 })
 check(error)
 revalidatePath('/events')
}
export async function addEventMember(fd:FormData){
 const {s}=await adminClient()
 const eventId=uuid.parse(fd.get('event_id'))
 const userId=uuid.parse(fd.get('user_id'))
 const [{data:p},{data:availability}]=await Promise.all([
  s.from('profiles').select('approved,role').eq('id',userId).single(),
  s.from('event_availability').select('response').eq('event_id',eventId).eq('user_id',userId).maybeSingle(),
 ])
 if(!p?.approved)throw new Error('Account niet goedgekeurd.')
 if(availability?.response!=='can')throw new Error('Selecteer iemand die heeft aangeduid dat die kan.')
 const eventRole=p.role==='responsible_lead'?'responsible_lead':p.role==='admin'?'admin':'employee'
 const {error}=await s.from('event_members').upsert({event_id:eventId,user_id:userId,event_role:eventRole},{onConflict:'event_id,user_id'})
 check(error)
 revalidatePath('/events');revalidatePath('/tasks');revalidatePath('/briefings');revalidatePath('/shifts');revalidatePath('/workplaces')
}
export async function addAvailableEventMembers(fd:FormData){
 const {s}=await adminClient()
 const eventId=uuid.parse(fd.get('event_id'))
 const userIds=[...new Set(fd.getAll('user_id').map(value=>uuid.parse(value)))]
 if(!userIds.length)throw new Error('Selecteer minstens één persoon.')
 const [{data:available,error:availabilityError},{data:approved,error:profileError}]=await Promise.all([
  s.from('event_availability').select('user_id').eq('event_id',eventId).eq('response','can').in('user_id',userIds),
  s.from('profiles').select('id,role').eq('approved',true).in('id',userIds),
 ])
 check(availabilityError);check(profileError)
 const allowed=new Set((available||[]).map(row=>row.user_id))
 const approvedById=new Map((approved||[]).map(row=>[row.id,row.role]))
 const valid=userIds.filter(id=>allowed.has(id)&&approvedById.has(id))
 if(valid.length!==userIds.length)throw new Error('Een selectie is niet langer beschikbaar voor dit evenement.')
 const {error}=await s.from('event_members').upsert(
  valid.map(user_id=>({
   event_id:eventId,
   user_id,
   event_role:approvedById.get(user_id)==='responsible_lead'?'responsible_lead':approvedById.get(user_id)==='admin'?'admin':'employee',
  })),
  {onConflict:'event_id,user_id'}
 )
 check(error)
 revalidatePath('/events');revalidatePath('/tasks');revalidatePath('/briefings');revalidatePath('/shifts');revalidatePath('/workplaces')
}
export async function assignAvailableCrewShift(fd:FormData){
 const {s}=await adminClient()
 const eventId=uuid.parse(fd.get('event_id'))
 const userId=uuid.parse(fd.get('user_id'))
 const workplaceId=uuid.parse(fd.get('workplace_id'))
 const [start,end]=dates(fd,'start','end')
 const roleName=text.parse(fd.get('role_name')||'Personeel')
 const shiftKind=z.enum(['event','setup','breakdown']).parse(fd.get('shift_kind')||'event')
 const [
  {data:person,error:personError},
  {data:availability,error:availabilityError},
  {data:workplace,error:workplaceError},
  {data:membership,error:membershipError},
 ]=await Promise.all([
  s.from('profiles').select('id,approved,role').eq('id',userId).single(),
  s.from('event_availability').select('response,setup_available,breakdown_available').eq('event_id',eventId).eq('user_id',userId).maybeSingle(),
  s.from('workplaces').select('id,event_id,is_active').eq('id',workplaceId).single(),
  s.from('event_members').select('user_id').eq('event_id',eventId).eq('user_id',userId).maybeSingle(),
 ])
 check(personError);check(availabilityError);check(workplaceError);check(membershipError)
 if(!person?.approved)throw new Error('Dit account is niet goedgekeurd.')
 const eligible=shiftKind==='event'
  ? availability?.response==='can'
  : shiftKind==='setup'
    ? availability?.setup_available===true
    : availability?.breakdown_available===true
 if(!eligible)throw new Error('Deze persoon heeft voor dit shift-type geen beschikbaarheid bevestigd.')
 if(!workplace||workplace.event_id!==eventId||!workplace.is_active)throw new Error('Selecteer een actieve werkplek van dit evenement.')
 if(!membership){
  const eventRole=person.role==='responsible_lead'?'responsible_lead':person.role==='admin'?'admin':'employee'
  const {error:memberError}=await s.from('event_members').insert({event_id:eventId,user_id:userId,event_role:eventRole})
  check(memberError)
 }
 const {error}=await s.rpc('upt_create_shift',{
  p_workplace:workplaceId,
  p_user:userId,
  p_role_name:roleName,
  p_start:start,
  p_end:end,
  p_overlap_allowed:fd.get('overlap_allowed')==='on',
  p_shift_kind:shiftKind,
 })
 check(error)
 revalidatePath('/events');revalidatePath('/shifts');revalidatePath('/workplaces');revalidatePath('/operations');revalidatePath('/tasks');revalidatePath('/briefings')
}
export async function assignResponsible(fd:FormData){
 const {s,user}=await adminClient()
 const workplace_id=uuid.parse(fd.get('workplace_id'))
 const user_id=uuid.parse(fd.get('user_id'))
 const [
  {data:p,error:profileError},
  {data:w,error:wError},
  {data:assignedShifts,error:shiftError},
 ]=await Promise.all([
  s.from('profiles').select('approved,role').eq('id',user_id).single(),
  s.from('workplaces').select('event_id,is_active').eq('id',workplace_id).single(),
  s.from('shifts').select('id').eq('workplace_id',workplace_id).eq('user_id',user_id).neq('status','cancelled').limit(1),
 ])
 check(profileError);check(wError);check(shiftError)
 if(!w||!w.is_active)throw new Error('Werkplek niet gevonden of niet actief.')
 if(!p?.approved)throw new Error('Selecteer een goedgekeurd personeelslid.')
 if(!assignedShifts?.length)throw new Error('Deze persoon heeft geen dienst op deze werkplek.')
 if(p.role==='staff'){
  const {error:roleError}=await s.rpc('upt_admin_set_account',{
   p_user:user_id,
   p_approved:true,
   p_role:'responsible_lead',
  })
  check(roleError)
 }
 const eventRole=p.role==='admin'?'admin':'responsible_lead'
 const {error:membershipError}=await s.from('event_members').upsert({
  event_id:w.event_id,
  user_id,
  event_role:eventRole,
 },{onConflict:'event_id,user_id'})
 check(membershipError)
 const {error}=await s.from('responsible_assignments').upsert({
  event_id:w.event_id,
  workplace_id,
  user_id,
  assigned_by:user.id,
 },{onConflict:'workplace_id,user_id'})
 check(error)
 revalidatePath('/workplaces');revalidatePath('/events');revalidatePath('/tasks');revalidatePath('/briefings');revalidatePath('/operations');revalidatePath('/personnel')
}
export async function demoteResponsibleToStaff(fd:FormData){
 const {s}=await adminClient()
 const workplaceId=uuid.parse(fd.get('workplace_id'))
 const userId=uuid.parse(fd.get('user_id'))
 const [
  {data:workplace,error:workplaceError},
  {data:profile,error:profileError},
  {data:assignment,error:assignmentError},
 ]=await Promise.all([
  s.from('workplaces').select('event_id').eq('id',workplaceId).single(),
  s.from('profiles').select('role,approved').eq('id',userId).single(),
  s.from('responsible_assignments').select('event_id,workplace_id,user_id').eq('workplace_id',workplaceId).eq('user_id',userId).maybeSingle(),
 ])
 check(workplaceError);check(profileError);check(assignmentError)
 if(!workplace||!assignment)throw new Error('Verantwoordelijke toewijzing niet gevonden.')
 if(profile?.role==='admin')throw new Error('Een beheerder kan hier niet naar personeel worden omgezet.')
 const {error:deleteError}=await s.from('responsible_assignments')
  .delete()
  .eq('workplace_id',workplaceId)
  .eq('user_id',userId)
 check(deleteError)
 const [{data:eventAssignments,error:eventAssignmentsError},{data:allAssignments,error:allAssignmentsError}]=await Promise.all([
  s.from('responsible_assignments').select('workplace_id').eq('event_id',workplace.event_id).eq('user_id',userId).limit(1),
  s.from('responsible_assignments').select('workplace_id').eq('user_id',userId).limit(1),
 ])
 check(eventAssignmentsError);check(allAssignmentsError)
 if(!eventAssignments?.length){
  const {error:membershipError}=await s.from('event_members')
   .update({event_role:'employee'})
   .eq('event_id',workplace.event_id)
   .eq('user_id',userId)
   .eq('event_role','responsible_lead')
  check(membershipError)
 }
 if(profile?.role==='responsible_lead'&&!allAssignments?.length){
  const {error:roleError}=await s.rpc('upt_admin_set_account',{
   p_user:userId,
   p_approved:profile.approved===true,
   p_role:'staff',
  })
  check(roleError)
  const {error:membershipsError}=await s.from('event_members')
   .update({event_role:'employee'})
   .eq('user_id',userId)
   .eq('event_role','responsible_lead')
  check(membershipsError)
 }
 revalidatePath('/workplaces')
 revalidatePath('/events')
 revalidatePath('/operations')
 revalidatePath('/tasks')
 revalidatePath('/briefings')
 revalidatePath('/personnel')
 revalidatePath('/')
}
export async function createShift(fd:FormData){
 const {s}=await adminClient()
 const [start,end]=dates(fd,'start','end')
 const {error}=await s.rpc('upt_create_shift',{
  p_workplace:uuid.parse(fd.get('workplace_id')),
  p_user:uuid.parse(fd.get('user_id')),
  p_role_name:text.parse(fd.get('role_name')||'Personeel'),
  p_start:start,
  p_end:end,
  p_overlap_allowed:fd.get('overlap_allowed')==='on',
  p_shift_kind:z.enum(['event','setup','breakdown']).parse(fd.get('shift_kind')||'event'),
 })
 check(error);revalidatePath('/shifts');revalidatePath('/operations')
}
export async function updateShift(fd:FormData){
 const {s}=await adminClient()
 const [start,end]=dates(fd,'start','end')
 const {error}=await s.rpc('upt_update_shift',{
  p_shift:uuid.parse(fd.get('shift_id')),
  p_role_name:text.parse(fd.get('role_name')||'Personeel'),
  p_start:start,
  p_end:end,
  p_overlap_allowed:fd.get('overlap_allowed')==='on',
  p_shift_kind:z.enum(['event','setup','breakdown']).parse(fd.get('shift_kind')||'event'),
 })
 check(error);revalidatePath('/shifts');revalidatePath('/operations')
}
export async function confirmShift(fd:FormData){
 const {s}=await approvedClient()
 const {error}=await s.rpc('upt_confirm_shift',{p_shift:uuid.parse(fd.get('shift_id'))})
 check(error)
 revalidatePath('/shifts');revalidatePath('/operations')
}
export async function cancelShift(fd:FormData){
 const {s}=await adminClient()
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
 const rawWorkplace=String(fd.get('workplace_id')||'').trim()
 const workplaceId=rawWorkplace?uuid.parse(rawWorkplace):null
 let eventId:string
 if(workplaceId){
  const {data:w,error:wError}=await s.from('workplaces').select('event_id').eq('id',workplaceId).single()
  check(wError);if(!w)throw new Error('Werkplek niet gevonden.')
  eventId=w.event_id
 }else{
  eventId=uuid.parse(fd.get('event_id'))
 }
 await requireEventManager(s,user.id,profile.role,eventId)
 await requireFeature(s,profile.role,'briefings',eventId,workplaceId)
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
 const rawWorkplace=String(fd.get('workplace_id')||'').trim()
 const workplaceId=rawWorkplace?uuid.parse(rawWorkplace):null
 let eventId:string
 if(workplaceId){
  const {data:w,error:wError}=await s.from('workplaces').select('event_id').eq('id',workplaceId).single()
  check(wError);if(!w)throw new Error('Werkplek niet gevonden.')
  eventId=w.event_id
 }else{
  eventId=uuid.parse(fd.get('event_id'))
 }
 await requireEventManager(s,user.id,profile.role,eventId)
 await requireFeature(s,profile.role,'briefings',eventId,workplaceId)
 const targetUser=uuid.parse(fd.get('user_id'))
 const {data:member,error:memberError}=await s.from('event_members')
  .select('user_id')
  .eq('event_id',eventId)
  .eq('user_id',targetUser)
  .maybeSingle()
 check(memberError);if(!member)throw new Error('Selecteer personeel dat aan dit evenement is toegewezen.')
 const {data,error}=await s.from('personal_instructions').insert({
  event_id:eventId,
  workplace_id:workplaceId,
  user_id:targetUser,
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
 const {data:current,error:currentError}=await s.from('briefings').select('event_id,workplace_id').eq('id',id).single()
 check(currentError);if(!current)throw new Error('Instructie niet gevonden.')
 await requireEventManager(s,user.id,profile.role,current.event_id)
 await requireFeature(s,profile.role,'briefings',current.event_id,current.workplace_id)
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
 const {data:current,error:currentError}=await s.from('personal_instructions').select('event_id,workplace_id').eq('id',id).single()
 check(currentError);if(!current)throw new Error('Persoonlijke instructie niet gevonden.')
 await requireEventManager(s,user.id,profile.role,current.event_id)
 await requireFeature(s,profile.role,'briefings',current.event_id,current.workplace_id)
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
 requireManager(profile.role)
 const files=workPhotoFiles(fd)
 const rawWorkplace=String(fd.get('workplace_id')||'').trim()
 let eventId:string
 let workplaceId:string|null=null
 if(rawWorkplace){
  workplaceId=uuid.parse(rawWorkplace)
  const {data:w,error:wError}=await s.from('workplaces').select('event_id,is_active').eq('id',workplaceId).single()
  check(wError);if(!w||!w.is_active)throw new Error('Werkplek niet gevonden.')
  eventId=w.event_id
 }else{
  eventId=uuid.parse(fd.get('event_id'))
 }
 if(profile.role==='responsible_lead'){
  if(!workplaceId)throw new Error('Kies je toegewezen werkplek.')
  const {data:assignment,error:assignmentError}=await s.from('responsible_assignments')
   .select('workplace_id')
   .eq('event_id',eventId)
   .eq('workplace_id',workplaceId)
   .eq('user_id',user.id)
   .maybeSingle()
  check(assignmentError)
  if(!assignment)throw new Error('Je kunt alleen taken beheren binnen je eigen toegewezen werkplek.')
 }else{
  await requireEventManager(s,user.id,profile.role,eventId)
 }
 await requireFeature(s,profile.role,'tasks',eventId,workplaceId)
 const userIds=[...new Set(fd.getAll('user_id').map(value=>uuid.parse(value)))]
 if(!userIds.length)throw new Error('Selecteer minstens één medewerker.')
 const [{data:members,error:memberError},{data:available,error:availabilityError}]=await Promise.all([
  s.from('event_members').select('user_id').eq('event_id',eventId).in('user_id',userIds),
  s.from('event_availability').select('user_id').eq('event_id',eventId).eq('response','can').in('user_id',userIds),
 ])
 check(memberError);check(availabilityError)
 const memberIds=new Set((members||[]).map(row=>row.user_id))
 const availableIds=new Set((available||[]).map(row=>row.user_id))
 if(userIds.some(id=>!memberIds.has(id)||!availableIds.has(id)))throw new Error('Selecteer alleen toegevoegde medewerkers die hebben aangeduid dat ze kunnen.')
 if(profile.role==='responsible_lead'&&workplaceId){
  const {data:workplaceShifts,error:shiftError}=await s.from('shifts')
   .select('user_id')
   .eq('event_id',eventId)
   .eq('workplace_id',workplaceId)
   .neq('status','cancelled')
   .in('user_id',userIds)
  check(shiftError)
  const workplaceUserIds=new Set((workplaceShifts||[]).map(row=>row.user_id))
  if(userIds.some(id=>!workplaceUserIds.has(id)))throw new Error('Selecteer alleen personeel dat aan jouw werkplek is toegewezen.')
 }
 const [first,...rest]=userIds
 const {data:taskId,error}=await s.rpc('upt_create_assigned_task',{
  p_event:eventId,
  p_workplace:workplaceId as unknown as string,
  p_user:first,
  p_title:text.parse(fd.get('title')),
  p_description:String(fd.get('description')||'').slice(0,4000),
 })
 check(error);if(!taskId)throw new Error('Taak kon niet worden aangemaakt.')
 try{
  for(const target of rest){
   const {error:assignError}=await s.rpc('upt_assign_task',{p_task:taskId,p_user:target})
   check(assignError)
  }
  await uploadWorkPhotos(s,user.id,{type:'task',id:taskId},files)
 }catch(error){
  await s.from('tasks').delete().eq('id',taskId)
  throw error
 }
 revalidatePath('/tasks')
}
export async function removeTaskAssignment(fd:FormData){
 const {s,user,profile}=await approvedClient()
 requireManager(profile.role)
 const assignmentId=uuid.parse(fd.get('assignment_id'))
 const {data:assignment,error:assignmentError}=await s.from('task_assignments').select('tasks(event_id,workplace_id)').eq('id',assignmentId).single()
 check(assignmentError)
 const task=assignment?.tasks
 if(!task)throw new Error('Taaktoewijzing niet gevonden.')

 if(profile.role==='responsible_lead'){
  if(!task.workplace_id)throw new Error('Je kunt alleen taken beheren binnen je eigen toegewezen werkplek.')

  const {data:responsibleAssignment,error:responsibleError}=await s.from('responsible_assignments')
   .select('workplace_id')
   .eq('event_id',task.event_id)
   .eq('workplace_id',task.workplace_id)
   .eq('user_id',user.id)
   .maybeSingle()

  check(responsibleError)

  if(!responsibleAssignment){
   throw new Error('Je kunt alleen taken beheren binnen je eigen toegewezen werkplek.')
  }
 }else{
  await requireEventManager(s,user.id,profile.role,task.event_id)
 }

 await requireFeature(s,profile.role,'tasks',task.event_id,task.workplace_id)

 const {error}=await s.rpc('upt_remove_task_assignment',{
  p_assignment:assignmentId,
 })

 check(error)
 revalidatePath('/tasks')
}

export async function markNotificationRead(fd:FormData){
 const s=await createClient()
 const {error}=await s.rpc('upt_mark_notification_read',{p_notification:uuid.parse(fd.get('notification_id'))})
 check(error);revalidatePath('/notifications')
}
export async function archiveEvent(fd:FormData){const {s}=await adminClient();const {error}=await s.from('events').update({status:'archived'}).eq('id',uuid.parse(fd.get('event_id')));check(error);revalidatePath('/events')}
export async function duplicateEvent(fd:FormData){const {s}=await adminClient();const [start,end]=dates(fd,'start_at','end_at');const {error}=await s.rpc('upt_duplicate_event',{p_event:uuid.parse(fd.get('event_id')),p_name:text.parse(fd.get('name')),p_start:start,p_end:end});check(error);revalidatePath('/events')}
export async function updateEvent(fd:FormData){
 const {s}=await adminClient()
 const [start,end]=dates(fd,'start_at','end_at')
 const location=await eventLocation(fd)
 const {error}=await s.from('events').update({
  name:text.parse(fd.get('name')),
  venue:location.venue,
  address:location.address,
  latitude:location.latitude,longitude:location.longitude,
  start_at:start,end_at:end,start_date:start,end_date:end,
  checkin_radius_m:z.coerce.number().int().min(10).max(10000).parse(fd.get('radius')),
 }).eq('id',uuid.parse(fd.get('event_id')))
 check(error);revalidatePath('/events')
}
export async function deleteEvent(fd:FormData){
 const {s}=await adminClient()
 const eventId=uuid.parse(fd.get('event_id'))
 const {error}=await s.from('events').delete().eq('id',eventId)
 check(error);revalidatePath('/events')
}