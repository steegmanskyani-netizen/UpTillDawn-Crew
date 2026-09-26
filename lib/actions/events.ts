'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/crew-server'
import { fetchFacebookEventInfo } from '@/lib/facebook-event'
import { geocodeGeoapify } from '@/lib/geoapify'

const text=z.string().trim().min(1).max(200)

function optionalIso(fd:FormData,name:string){
 const raw=String(fd.get(name)||'').trim()
 return raw?z.string().datetime({offset:true}).parse(raw):null
}

async function adminClient(){
 const s=await createClient()
 const {data:{user}}=await s.auth.getUser()
 if(!user)throw new Error('Aanmelden vereist.')
 const [{data:approved},{data:isAdmin}]=await Promise.all([s.rpc('upt_is_approved'),s.rpc('upt_is_admin',{uid:user.id})])
 if(!approved||!isAdmin)throw new Error('Geen toegang.')
 return {s,user}
}

async function eventLocation(fd:FormData,override?:{venue?:string|null;address?:string|null}){
 let venue=String(override?.venue??fd.get('venue')??'').trim().slice(0,200)
 let address=String(override?.address??fd.get('address')??'').trim().slice(0,500)
 const rawLatitude=override?.address||override?.venue?'':String(fd.get('latitude')||'').trim()
 const rawLongitude=override?.address||override?.venue?'':String(fd.get('longitude')||'').trim()
 let latitude=rawLatitude?z.coerce.number().min(-90).max(90).parse(rawLatitude):null
 let longitude=rawLongitude?z.coerce.number().min(-180).max(180).parse(rawLongitude):null
 if((latitude===null)!==(longitude===null))throw new Error('Selecteer een geldige locatie of adres uit de suggesties.')
 if(latitude===null&&longitude===null&&(address||venue)){
  const resolved=await geocodeGeoapify(address||venue)
  if(!resolved)throw new Error('Geen geldige locatie gevonden. Kies een locatie of adres uit de suggesties.')
  latitude=resolved.latitude;longitude=resolved.longitude;address=resolved.formatted
  if(!venue)venue=resolved.name
 }
 return {venue,address,latitude,longitude}
}

export async function createEvent(fd:FormData){
 const {s,user}=await adminClient()
 const facebookUrl=String(fd.get('facebook_event_url')||'').trim()
 const imported=facebookUrl?await fetchFacebookEventInfo(facebookUrl):null
 const name=text.parse(imported?.name||String(fd.get('name')||'').trim())
 const start=imported?.startAt||optionalIso(fd,'start_at')
 const end=imported?.endAt||optionalIso(fd,'end_at')
 if(!start||!end)throw new Error('Vul start- en einduur in wanneer Facebook deze niet openbaar meegeeft.')
 if(Date.parse(end)<=Date.parse(start))throw new Error('Einde moet na begin liggen.')
 const location=await eventLocation(fd,{venue:imported?.venue||undefined,address:imported?.address||undefined})
 const {error}=await s.from('events').insert({
  name,venue:location.venue,address:location.address,latitude:location.latitude,longitude:location.longitude,
  start_at:start,end_at:end,start_date:start,end_date:end,
  facebook_event_url:facebookUrl?(imported?.sourceUrl||facebookUrl):null,
  image_url:imported?.imageUrl||null,
  checkin_radius_m:z.coerce.number().int().min(10).max(10000).parse(fd.get('radius')||100),created_by:user.id,
 })
 if(error){console.error('[Event create]',{code:error.code});throw new Error('Evenement aanmaken mislukt.')}
 revalidatePath('/events');revalidatePath('/chat')
}
