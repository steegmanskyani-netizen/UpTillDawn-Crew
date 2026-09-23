"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/providers"
import { cn } from "@/lib/utils"
import { LayoutDashboard, CalendarDays, Clock3, AlertTriangle, Users, ListChecks } from "lucide-react"

const items=[
 {href:"/",label:"Overzicht",icon:LayoutDashboard,roles:["employee","responsible_lead","admin"]},
 {href:"/events",label:"Evenementen",icon:CalendarDays,roles:["employee","responsible_lead","admin"]},
 {href:"/operations",label:"Werk",icon:Clock3,roles:["employee","responsible_lead","admin"]},
 {href:"/tasks",label:"Taken",icon:ListChecks,roles:["employee","responsible_lead","admin"]},
 {href:"/incidents",label:"Incidenten",icon:AlertTriangle,roles:["responsible_lead","admin"]},
 {href:"/crew",label:"Personeel",icon:Users,roles:["employee","responsible_lead","admin"]},
]

export function MobileBottomNav({
 incidentMissed = 0,
 taskMissed = 0,
 showOperations = false,
 showTasks = false,
}: {
 incidentMissed?: number
 taskMissed?: number
 showOperations?: boolean
 showTasks?: boolean
}) {
 const pathname=usePathname()
 const {roles}=useAuth()
 return <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-border bg-card/95 backdrop-blur p-1.5 md:hidden">
  {items.filter(i=>{
   if(!roles.some(r=>i.roles.includes(r))) return false
   if(i.href==="/operations") return showOperations
   if(i.href==="/tasks") return showTasks
   return true
  }).map(i=>{
   const href=i.href==='/'&&roles.includes('admin')?'/admin':i.href
   const I=i.icon
   const active=href==='/'?pathname==='/':pathname.startsWith(href)
   const count=i.href==="/incidents"?incidentMissed:i.href==="/tasks"?taskMissed:0
   return <Link key={i.href} href={href} className={cn("flex min-w-14 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold",active?"text-violet-400":"text-muted-foreground")}>
    <span className="relative">
     <I className="h-5 w-5"/>
     {count>0&&<span className="absolute -right-3 -top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black leading-none text-white shadow ring-2 ring-card">{count>99?"99+":count}</span>}
    </span>
    {i.label}
   </Link>
  })}
 </nav>
}
