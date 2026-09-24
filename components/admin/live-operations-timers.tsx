'use client'

import { useEffect,useMemo,useState } from 'react'

type BreakWindow={id:string;startedAt:string;endedAt:string|null}
type ActivePerson={
 sessionId:string
 name:string
 role:string
 title:string
 workplaceId:string
 workplaceName:string
 startedAt:string
 breaks:BreakWindow[]
 isResponsible:boolean
}
type RunningShift={
 shiftId:string
 name:string
 scheduledStart:string
 actualStart:string|null
 status:'WERKT'|'PAUZE'|'NIET GESTART'
 breaks:BreakWindow[]
}

function formatDigital(totalSeconds:number){
 const seconds=Math.max(0,Math.floor(totalSeconds))
 const hours=Math.floor(seconds/3600)
 const minutes=Math.floor((seconds%3600)/60)
 const secs=seconds%60
 return [hours,minutes,secs].map(value=>String(value).padStart(2,'0')).join(':')
}

function breakSeconds(breaks:BreakWindow[],now:number){
 return breaks.reduce((total,item)=>{
  const start=Date.parse(item.startedAt)
  const end=item.endedAt?Date.parse(item.endedAt):now
  return total+Math.max(0,Math.floor((end-start)/1000))
 },0)
}

function activeBreakSeconds(breaks:BreakWindow[],now:number){
 const active=breaks.find(item=>!item.endedAt)
 return active?Math.max(0,Math.floor((now-Date.parse(active.startedAt))/1000)):0
}

function useClock(){
 const [now,setNow]=useState(()=>Date.now())
 useEffect(()=>{
  const timer=window.setInterval(()=>setNow(Date.now()),1000)
  return()=>window.clearInterval(timer)
 },[])
 return now
}

export function AdminActivePersonnel({people}:{people:ActivePerson[]}){
 const now=useClock()
 const groups=useMemo(()=>{
  const sorted=[...people].sort((a,b)=>
   a.workplaceName.localeCompare(b.workplaceName,'nl')
   || b.isResponsible-a.isResponsible
   || a.name.localeCompare(b.name,'nl')
  )
  const map=new Map<string,{name:string;people:ActivePerson[]}>()
  for(const person of sorted){
   const group=map.get(person.workplaceId)||{name:person.workplaceName,people:[]}
   group.people.push(person)
   map.set(person.workplaceId,group)
  }
  return [...map.entries()]
 },[people])

 if(!people.length)return <p className="text-muted-foreground">Niemand is momenteel door de server bevestigd aan het werk.</p>

 return <div className="space-y-4">
  {groups.map(([workplaceId,group])=><section key={workplaceId} className="space-y-2">
   <h3 className="text-sm font-black uppercase tracking-wide text-violet-300">{group.name}</h3>
   {group.people.map(person=>{
    const activePause=person.breaks.some(item=>!item.endedAt)
    const totalPause=breakSeconds(person.breaks,now)
    const gross=Math.max(0,Math.floor((now-Date.parse(person.startedAt))/1000))
    const work=Math.max(0,gross-totalPause)
    const displayed=activePause?activeBreakSeconds(person.breaks,now):work
    return <article key={person.sessionId} className="rounded-xl border p-3">
     <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
       <p className="truncate font-bold">{person.name}</p>
       <p className="text-sm text-muted-foreground">{person.role} · {person.title}</p>
      </div>
      <div className="text-right">
       <p className={activePause?'text-xs font-black text-amber-300':'text-xs font-black text-emerald-300'}>{activePause?'PAUZE':'WERK'}</p>
       <p className="font-mono text-xl font-black tabular-nums">{formatDigital(displayed)}</p>
      </div>
     </div>
    </article>
   })}
  </section>)}
 </div>
}

export function AdminRunningShifts({shifts}:{shifts:RunningShift[]}){
 const now=useClock()

 if(!shifts.length)return <p className="text-muted-foreground">Er lopen momenteel geen diensten van personeel of verantwoordelijken.</p>

 return <div className="space-y-2">
  {shifts.map(shift=>{
   const pause=breakSeconds(shift.breaks,now)
   const start=shift.actualStart||shift.scheduledStart
   return <article key={shift.shiftId} className="rounded-xl border p-3">
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
     <p className="truncate font-bold">{shift.name}</p>
     <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Startuur</p><p className="font-mono tabular-nums">{new Date(start).toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</p></div>
     <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pauze</p><p className="font-mono tabular-nums">{formatDigital(pause)}</p></div>
     <span className={shift.status==='PAUZE'?'rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300':shift.status==='WERKT'?'rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300':'rounded-full border px-3 py-1 text-xs font-bold'}>{shift.status}</span>
    </div>
   </article>
  })}
 </div>
}
