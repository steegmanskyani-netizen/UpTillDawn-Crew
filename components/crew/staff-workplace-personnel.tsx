"use client"

import { useEffect,useMemo } from "react"
import { useRouter } from "next/navigation"

export type StaffWorkplacePerson={
  sessionId:string
  name:string
  workplaceId:string
  workplaceName:string
  status:"WERKT"|"PAUZE"
}

export function StaffWorkplacePersonnel({people}:{people:StaffWorkplacePerson[]}){
  const router=useRouter()

  useEffect(()=>{
    const refresh=window.setInterval(()=>router.refresh(),15000)
    return()=>window.clearInterval(refresh)
  },[router])

  const groups=useMemo(()=>{
    const sorted=[...people].sort((a,b)=>
      a.workplaceName.localeCompare(b.workplaceName,"nl")
      || a.name.localeCompare(b.name,"nl")
    )
    const map=new Map<string,{name:string;people:StaffWorkplacePerson[]}>()
    for(const person of sorted){
      const group=map.get(person.workplaceId)||{name:person.workplaceName,people:[]}
      group.people.push(person)
      map.set(person.workplaceId,group)
    }
    return [...map.entries()]
  },[people])

  if(!people.length)return <p className="text-muted-foreground">Momenteel is er geen ander personeel van jouw werkplek aan het werk.</p>

  return <div className="space-y-4">
    {groups.map(([workplaceId,group])=><section key={workplaceId} className="space-y-2">
      <h3 className="text-sm font-black uppercase tracking-wide text-violet-300">{group.name}</h3>
      {group.people.map(person=><article key={person.sessionId} className="flex items-center justify-between gap-3 rounded-xl border p-3">
        <p className="min-w-0 truncate font-bold">{person.name}</p>
        <span className={person.status==="PAUZE"
          ?"shrink-0 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300"
          :"shrink-0 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300"
        }>{person.status}</span>
      </article>)}
    </section>)}
  </div>
}
