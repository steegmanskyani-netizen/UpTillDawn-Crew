'use client'
import {useState} from 'react'
import {useRouter} from 'next/navigation'
import { enqueue } from '@/lib/crew-queue'

const statuses = [
 {value:'NOT STARTED',label:'NIET GESTART'},
 {value:'IN PROGRESS',label:'BEZIG'},
 {value:'COMPLETED',label:'VOLTOOID'},
]

export function TaskControls({id,userId}:{id:string;userId:string}){const [busy,setBusy]=useState(false),[error,setError]=useState(false);const router=useRouter();return <div className="mt-3 flex flex-wrap gap-2">{statuses.map(status=><button key={status.value} disabled={busy} className="rounded-lg border p-3" onClick={async()=>{setBusy(true);setError(false);try{await enqueue(userId,'task',{assignment_id:id,status:status.value});router.refresh()}catch{setError(true)}finally{setBusy(false)}}}>{status.label}</button>)}{error&&<p>Wijziging kon niet worden bewaard.</p>}</div>}