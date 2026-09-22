'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { enqueue } from '@/lib/crew-queue'
export function IncidentForm({userId,events}:{userId:string;events:{id:string;name:string}[]}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');const router=useRouter()
 return <form className="space-y-3 rounded-2xl border border-red-500 p-5" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);const fd=new FormData(e.currentTarget);const message=String(fd.get('message')||'').trim();try{
 let location:{latitude:number;longitude:number;accuracy:number}|null=null
 if(navigator.geolocation&&navigator.onLine)location=await new Promise(resolve=>navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),()=>resolve(null),{timeout:6000,maximumAge:0}))
 await enqueue(userId,'incident',{event_id:String(fd.get('event')),message,...(location||{})});setStatus('Melding bewaard. Wacht op serverbevestiging in het meldingenoverzicht.');router.refresh()
 }catch{setStatus('Melding kon niet worden bewaard. Probeer opnieuw.')}finally{setBusy(false)}}}>
 <h2 className="text-xl font-black text-red-400">URGENT MELDEN</h2><select name="event" required className="w-full rounded-lg border bg-background p-3"><option value="">Selecteer event</option>{events.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><textarea name="message" required maxLength={4000} placeholder="Wat is er aan de hand?" className="min-h-28 w-full rounded-lg border bg-background p-3"/><button disabled={busy} className="w-full rounded-xl bg-red-600 p-4 font-black text-white">{busy?'BEWAREN…':'URGENT VERSTUREN'}</button>{status&&<p role="status">{status}</p>}</form>
}
