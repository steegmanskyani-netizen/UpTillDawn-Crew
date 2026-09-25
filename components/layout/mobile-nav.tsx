"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, ChevronUp } from "lucide-react"
import { NAV_ITEMS, type NavigationItem } from "@/components/layout/navigation-items"
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
 const [expanded,setExpanded]=useState(false)
 const {roles,isAdmin,editMode}=useAuth()
 const roleKey:RoleRuleRole=roles.includes("admin")?"admin":roles.includes("responsible_lead")?"responsible_lead":"staff"
 const order=new Map(featureOrder.map((key,index)=>[key,index]))

 const items=NAV_ITEMS.filter(i=>{
   if(!roles.some(r=>i.roles.includes(r))) return false
   if(Object.prototype.hasOwnProperty.call(featureVisibility,i.key)&&!featureVisibility[i.key]) return false
   return true
 }).sort((a,b)=>(order.get(a.key)??999)-(order.get(b.key)??999))

 const hrefFor=(item:NavigationItem)=>item.href==='/'&&isAdmin&&!editMode?'/admin':item.href
 const isActive=(item:NavigationItem)=>{
   const href=hrefFor(item)
   return href==='/'?pathname==='/':pathname.startsWith(href)
 }
 const activeIndex=items.findIndex(isActive)
 const compactItems=items.length<=3
   ? items
   : activeIndex<=0
     ? items.slice(0,3)
     : activeIndex>=items.length-1
       ? items.slice(-3)
       : items.slice(activeIndex-1,activeIndex+2)

 const badgeCount=(key:string)=>key==="chat"?chatMissed:key==="incidents"?incidentMissed:key==="tasks"?taskMissed:0

 const NavItem=({item,expandedItem=false}:{item:NavigationItem;expandedItem?:boolean})=>{
   const href=hrefFor(item)
   const active=isActive(item)
   const Icon=item.icon
   const count=badgeCount(item.key)
   const label=featureLabels[item.key] || getDefaultRoleUiLabel(roleKey,item.key,item.label)
   return <Link
    data-layout-key={item.key}
    href={href}
    onClick={()=>setExpanded(false)}
    className={cn(
      expandedItem
        ?"flex min-h-16 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold"
        :"flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold",
      active?"bg-violet-500/10 text-violet-400":"text-muted-foreground",
    )}
   >
    <span className="relative shrink-0">
     <Icon className={expandedItem?"h-5 w-5":"h-5 w-5"}/>
     {count>0&&<span className="absolute -right-3 -top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black leading-none text-white shadow ring-2 ring-card">{count>99?"99+":count}</span>}
    </span>
    <span className={expandedItem?"truncate":"max-w-full truncate"}>{label}</span>
   </Link>
 }

 return <nav aria-label="Mobiele navigatie" className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur md:hidden">
  {expanded&&
   <div className="absolute inset-x-0 bottom-full max-h-[60dvh] overflow-y-auto border-t border-border bg-card/98 p-3 shadow-2xl">
    <div className="grid grid-cols-2 gap-2">
     {items.map(item=><NavItem key={item.key} item={item} expandedItem/>)}
    </div>
   </div>
  }

  <div className="flex items-stretch gap-1 px-2 py-1.5">
   <div className="flex min-w-0 flex-1 items-stretch gap-1">
    {compactItems.map(item=><NavItem key={item.key} item={item}/>)}
   </div>
   {items.length>3&&
    <button
     type="button"
     aria-label={expanded?"Navigatie inklappen":"Navigatie uitklappen"}
     aria-expanded={expanded}
     onClick={()=>setExpanded(value=>!value)}
     className={cn(
       "flex w-12 shrink-0 items-center justify-center rounded-lg border border-border",
       expanded?"bg-violet-500/10 text-violet-400":"text-muted-foreground",
     )}
    >
     {expanded?<ChevronDown className="h-5 w-5"/>:<ChevronUp className="h-5 w-5"/>}
    </button>
   }
  </div>
 </nav>
}
