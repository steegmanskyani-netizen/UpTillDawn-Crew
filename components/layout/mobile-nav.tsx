"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { NAV_ITEMS } from "@/components/layout/navigation-items"
import { useAuth } from "@/lib/providers"
import { cn } from "@/lib/utils"
import { getDefaultRoleUiLabel, type RoleRuleRole } from "@/lib/role-ui"

export function MobileBottomNav({
  chatMissed=0,
  incidentMissed=0,
  taskMissed=0,
  featureOrder=[],
  featureLabels={},
  featureVisibility={},
}:{
  chatMissed?:number
  incidentMissed?:number
  taskMissed?:number
  featureOrder?:string[]
  featureLabels?:Record<string,string>
  featureVisibility?:Record<string,boolean>
}) {
 const pathname=usePathname()
 const activeRef=useRef<HTMLAnchorElement|null>(null)
 const {roles,isAdmin,editMode}=useAuth()
 const roleKey:RoleRuleRole=roles.includes("admin")?"admin":roles.includes("responsible_lead")?"responsible_lead":"staff"
 const order=new Map(featureOrder.map((key,index)=>[key,index]))

 const items=NAV_ITEMS.filter(i=>{
   if(!roles.some(r=>i.roles.includes(r))) return false
   if(Object.prototype.hasOwnProperty.call(featureVisibility,i.key)&&!featureVisibility[i.key]) return false
   return true
 }).sort((a,b)=>(order.get(a.key)??999)-(order.get(b.key)??999))

 useEffect(()=>{
   activeRef.current?.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"})
 },[pathname])

 return <nav aria-label="Mobiele navigatie" className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur md:hidden">
  <div className="snap-x snap-mandatory touch-pan-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
   <div className="flex w-max min-w-full items-stretch gap-1 px-2 py-1.5">
    {items.map(i=>{
     const href=i.href==='/'&&isAdmin&&!editMode?'/admin':i.href
     const active=href==='/'?pathname==='/':pathname.startsWith(href)
     const Icon=i.icon
     const count=i.key==="chat"?chatMissed:i.key==="incidents"?incidentMissed:i.key==="tasks"?taskMissed:0
     return <Link
      ref={active?activeRef:undefined}
      data-layout-key={i.key}
      key={i.key}
      href={href}
      className={cn(
        "flex min-w-[86px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold",
        active?"bg-violet-500/10 text-violet-400":"text-muted-foreground",
      )}
     >
      <span className="relative">
       <Icon className="h-5 w-5"/>
       {count>0&&<span className="absolute -right-3 -top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black leading-none text-white shadow ring-2 ring-card">{count>99?"99+":count}</span>}
      </span>
      <span className="max-w-[82px] truncate">{featureLabels[i.key] || getDefaultRoleUiLabel(roleKey,i.key,i.label)}</span>
     </Link>
    })}
   </div>
  </div>
 </nav>
}
