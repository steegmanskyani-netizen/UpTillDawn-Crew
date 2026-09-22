'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { enqueue } from '@/lib/crew-queue'
export function TaskControls({id,userId}:{id:string;userId:string}){const [busy,setBusy]=useState(false),[error,setError]=useState(false);const router=useRouter();return <div className="mt-3 flex flex-wrap gap-2">{['NOT STARTED','IN PROGRESS','COMPLETED'].map(status=><button key={status} disabled={busy} className="rounded-lg border p-3" onClick={async()=>{setBusy(true);setError(false);try{await enqueue(userId,'task',{assignment_id:id,status});router.refresh()}catch{setError(true)}finally{setBusy(false)}}}>{status}</button>)}{error&&<p>Wijziging kon niet worden bewaard.</p>}</div>}
