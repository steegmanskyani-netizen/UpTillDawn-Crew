'use client'
import { useState } from 'react'
export function DateInput({name}:{name:string}){
 const [iso,setIso]=useState('')
 return <label className="grid gap-1 text-sm">{name.includes('end')?'Einde':'Begin'} (lokale tijd)
 <input type="datetime-local" required className="rounded-lg border bg-background p-3" onChange={e=>setIso(e.target.value?new Date(e.target.value).toISOString():'')}/>
 <input type="hidden" name={name} value={iso}/></label>
}
