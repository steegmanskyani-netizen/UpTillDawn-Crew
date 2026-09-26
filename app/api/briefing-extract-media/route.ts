import { inflateRawSync } from 'node:zlib'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/crew-server'

export const runtime = 'nodejs'
const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_IMAGES = 12
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024
const OFFICE_TYPES = new Map([
 ['application/vnd.openxmlformats-officedocument.wordprocessingml.document','word/media/'],
 ['application/vnd.openxmlformats-officedocument.presentationml.presentation','ppt/media/'],
 ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','xl/media/'],
])
const IMAGE_TYPES:Record<string,string>={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'}

type ZipEntry={name:string;method:number;compressedSize:number;uncompressedSize:number;localOffset:number}
function u16(buffer:Buffer,offset:number){return buffer.readUInt16LE(offset)}
function u32(buffer:Buffer,offset:number){return buffer.readUInt32LE(offset)}
function zipEntries(buffer:Buffer){
 const entries:ZipEntry[]=[]
 let eocd=-1
 for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--){if(u32(buffer,i)===0x06054b50){eocd=i;break}}
 if(eocd<0)throw new Error('ZIP directory ontbreekt.')
 const count=u16(buffer,eocd+10),centralOffset=u32(buffer,eocd+16)
 let offset=centralOffset
 for(let index=0;index<count;index++){
  if(offset+46>buffer.length||u32(buffer,offset)!==0x02014b50)throw new Error('Ongeldige ZIP directory.')
  const method=u16(buffer,offset+10),compressedSize=u32(buffer,offset+20),uncompressedSize=u32(buffer,offset+24),nameLength=u16(buffer,offset+28),extraLength=u16(buffer,offset+30),commentLength=u16(buffer,offset+32),localOffset=u32(buffer,offset+42)
  const name=buffer.subarray(offset+46,offset+46+nameLength).toString('utf8')
  entries.push({name,method,compressedSize,uncompressedSize,localOffset})
  offset+=46+nameLength+extraLength+commentLength
 }
 return entries
}
function extract(buffer:Buffer,entry:ZipEntry){
 const offset=entry.localOffset
 if(offset+30>buffer.length||u32(buffer,offset)!==0x04034b50)throw new Error('Ongeldige ZIP entry.')
 const nameLength=u16(buffer,offset+26),extraLength=u16(buffer,offset+28),start=offset+30+nameLength+extraLength,end=start+entry.compressedSize
 if(end>buffer.length)throw new Error('Onvolledige ZIP entry.')
 const compressed=buffer.subarray(start,end)
 const output=entry.method===0?Buffer.from(compressed):entry.method===8?inflateRawSync(compressed):null
 if(!output)throw new Error('Niet-ondersteunde ZIP compressie.')
 if(output.length!==entry.uncompressedSize)throw new Error('Ongeldige ZIP bestandsgrootte.')
 return output
}
function safeName(name:string,index:number){const raw=name.split('/').pop()||`afbeelding-${index+1}`;return raw.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120)}

export async function POST(request:Request){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser()
 if(!user)return NextResponse.json({error:'Niet ingelogd.'},{status:401})
 const {data:profile}=await supabase.from('profiles').select('role,approved').eq('id',user.id).single();const {data:effectiveRole}=await supabase.rpc('upt_current_effective_role');const role=effectiveRole||profile?.role
 if(!profile?.approved||!['admin','responsible_lead'].includes(role||''))return NextResponse.json({error:'Geen toegang.'},{status:403})
 const form=await request.formData(),file=form.get('file');if(!(file instanceof File))return NextResponse.json({error:'Geen bestand ontvangen.'},{status:400})
 const prefix=OFFICE_TYPES.get(file.type);if(!prefix)return NextResponse.json({images:[]})
 if(file.size<=0||file.size>MAX_FILE_SIZE)return NextResponse.json({error:'Bestand is leeg of groter dan 20 MB.'},{status:400})
 try{
  const buffer=Buffer.from(await file.arrayBuffer()),entries=zipEntries(buffer).filter(entry=>entry.name.startsWith(prefix)&&!entry.name.endsWith('/'))
  const images:Array<{name:string;mimeType:string;base64:string}>=[];let total=0
  for(const entry of entries){
   if(images.length>=MAX_IMAGES)break
   const ext=entry.name.split('.').pop()?.toLowerCase()||'',mimeType=IMAGE_TYPES[ext];if(!mimeType)continue
   if(entry.uncompressedSize>10*1024*1024||total+entry.uncompressedSize>MAX_TOTAL_IMAGE_BYTES)continue
   const bytes=extract(buffer,entry);total+=bytes.length;images.push({name:safeName(entry.name,images.length),mimeType,base64:bytes.toString('base64')})
  }
  return NextResponse.json({images})
 }catch{return NextResponse.json({error:'Ingesloten afbeeldingen konden niet betrouwbaar worden uitgelezen.'},{status:422})}
}
