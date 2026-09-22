'use client'
import { createClient } from '@/lib/supabase/crew-client'
import type { Json } from '@/types/crew-database'
export type QueuedOperation={id:string;userId:string;type:string;payload:Record<string,Json>;createdAt:number;attempts:number;error?:string}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const request=indexedDB.open('uptilldawn-operations',1)
 request.onupgradeneeded=()=>request.result.createObjectStore('operations',{keyPath:'id'})
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
})}
async function write(operation:QueuedOperation,remove=false){const db=await database();try{await new Promise<void>((resolve,reject)=>{
 const tx=db.transaction('operations','readwrite');const store=tx.objectStore('operations');if(remove)store.delete(operation.id);else store.put(operation)
 tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
})}finally{db.close()}}
export async function queued(userId:string):Promise<QueuedOperation[]>{const db=await database();try{return await new Promise((resolve,reject)=>{
 const q=db.transaction('operations').objectStore('operations').getAll();q.onsuccess=()=>resolve((q.result as QueuedOperation[]).filter(x=>x.userId===userId).sort((a,b)=>a.createdAt-b.createdAt));q.onerror=()=>reject(q.error)
})}finally{db.close()}}
let running:Promise<void>|null=null
export async function synchronize(userId:string){
 if(running)return running
 running=(async()=>{
  const s=createClient();const {data:{user}}=await s.auth.getUser()
  if(user?.id!==userId)return
  const ordered=new Set(['start_work','start_break','stop_break','stop_work','transition'])
  let timeConflict=false
  for(const op of await queued(userId)){
   if(timeConflict&&ordered.has(op.type))continue
   if(!navigator.onLine)break
   try{
    const {error}=await s.rpc('upt_sync_operation',{p_id:op.id,p_type:op.type,p_payload:op.payload})
    if(error){await write({...op,attempts:op.attempts+1,error:'Niet verwerkt. Controleer de actuele werkstatus; deze actie blijft bewaard.'});if(ordered.has(op.type))timeConflict=true;continue}
    await write(op,true)
   }catch{await write({...op,attempts:op.attempts+1,error:'Verbinding onderbroken; opnieuw proberen.'});break}
  }
 })().finally(()=>{running=null;window.dispatchEvent(new Event('crew-queue-change'))})
 return running
}
export async function enqueue(userId:string,type:string,payload:Record<string,Json>){
 const op:QueuedOperation={id:crypto.randomUUID(),userId,type,payload,createdAt:Date.now(),attempts:0}
 await write(op);window.dispatchEvent(new Event('crew-queue-change'))
 if(navigator.onLine)await synchronize(userId)
 return op.id
}
