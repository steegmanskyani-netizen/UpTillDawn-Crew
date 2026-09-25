"use client"

import { useEffect,useMemo,useState } from "react"
import { useRouter } from "next/navigation"

type BreakWindow={startedAt:string;endedAt:string|null}

export type ResponsibleLivePerson={
  sessionId:string
  name:string
  workplaceId:string
  workplaceName:string
  startedAt:string
  breaks:BreakWindow[]
}

function formatDigital(totalSeconds:number){
  const seconds=Math.max(0,Math.floor(totalSeconds))
  const hours=Math.floor(seconds/3600)
  const minutes=Math.floor((seconds%3600)/60)
  const secs=seconds%60
  return [hours,minutes,secs].map(value=>String(value).padStart(2,"0")).join(":")
}

export function ResponsibleLivePersonnel({people}:{people:ResponsibleLivePerson[]}){
  const router=useRouter()
  const [now,setNow]=useState(()=>Date.now())

  useEffect(()=>{
    const clock=window.setInterval(()=>setNow(Date.now()),1000)
    const refresh=window.setInterval(()=>router.refresh(),15000)
    return()=>{window.clearInterval(clock);window.clearInterval(refresh)}
  },[router])

  const groups=useMemo(()=>{
    const sorted=[...people].sort((a,b)=>
      a.workplaceName.localeCompare(b.workplaceName,"nl")
      || a.name.localeCompare(b.name,"nl")
    )
    const map=new Map<string,{name:string;people:ResponsibleLivePerson[]}>()
    for(const person of sorted){
      const group=map.get(person.workplaceId)||{name:person.workplaceName,people:[]}
      group.people.push(person)
      map.set(person.workplaceId,group)
    }
    return [...map.entries()]
  },[people])

  if(!people.length)return <p className="text-muted-foreground">Momenteel is er geen personeel van jouw werkplek aan het werk.</p>

  return <div className="space-y-4">
    {groups.map(([workplaceId,group])=><section key={workplaceId} className="space-y-2">
      <h3 className="text-sm font-black uppercase tracking-wide text-violet-300">{group.name}</h3>
      {group.people.map(person=>{
        const activeBreak=person.breaks.find(item=>!item.endedAt)
        const totalBreakSeconds=person.breaks.reduce((total,item)=>{
          const start=Date.parse(item.startedAt)
          const end=item.endedAt?Date.parse(item.endedAt):now
          return total+Math.max(0,Math.floor((end-start)/1000))
        },0)
        const workSeconds=Math.max(0,Math.floor((now-Date.parse(person.startedAt))/1000)-totalBreakSeconds)
        const pauseSeconds=activeBreak?Math.max(0,Math.floor((now-Date.parse(activeBreak.startedAt))/1000)):0
        const onBreak=Boolean(activeBreak)
        return <article key={person.sessionId} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
          <p className="truncate font-bold">{person.name}</p>
          <span className={onBreak
            ?"w-fit rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300"
            :"w-fit rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300"
          }>{onBreak?"PAUZE":"WERKT"}</span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{onBreak?"Pauzetimer":"Werktimer"}</p>
            <p className="font-mono text-lg font-black tabular-nums">{formatDigital(onBreak?pauseSeconds:workSeconds)}</p>
          </div>
        </article>
      })}
    </section>)}
  </div>
}
