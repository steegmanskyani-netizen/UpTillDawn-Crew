'use client'
import { useEffect,useState } from 'react'
import { useAuth } from '@/lib/providers'
import { queued,synchronize,type QueuedOperation } from '@/lib/crew-queue'
export function QueueStatus(){
 const {user}=useAuth();const [ops,setOps]=useState<QueuedOperation[]>([])
 useEffect(()=>{if(!user)return;const id=user.id;let alive=true
 const refresh=()=>{void queued(id).then(x=>{if(alive)setOps(x)}).catch(()=>{})}
 const sync=()=>{void synchronize(id).catch(()=>{})}
 refresh();sync();window.addEventListener('crew-queue-change',refresh);window.addEventListener('online',sync)
 const timer=setInterval(sync,30000)
 return()=>{alive=false;clearInterval(timer);window.removeEventListener('crew-queue-change',refresh);window.removeEventListener('online',sync)}
 },[user])
 if(!ops.length)return null
 return <aside role="status" className="border-b border-amber-400/30 bg-amber-950 p-3 text-sm text-amber-100">{ops.length} actie(s) wachten op bevestiging. De server bepaalt het registratietijdstip.
 {ops.some(x=>x.error)&&<p>Synchronisatie vereist controle. Acties zijn bewaard; er is nog geen succes bevestigd.</p>}
 <button className="ml-3 underline" onClick={()=>user&&void synchronize(user.id)}>Opnieuw proberen</button></aside>
}
