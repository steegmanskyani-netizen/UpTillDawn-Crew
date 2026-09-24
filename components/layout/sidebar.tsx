"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/providers"
import { cn } from "@/lib/utils"
import { LayoutDashboard, CalendarDays, MapPin, Clock3, AlertTriangle, Users, Shield, Settings, ScrollText } from "lucide-react"

const items = [
  { key:"overview", href: "/", label: "Overzicht", icon: LayoutDashboard, roles: ["employee","responsible_lead","admin"] },
  { key:"operations", href: "/operations", label: "Mijn werkuren", icon: Clock3, roles: ["employee","responsible_lead","admin"] },
  { key:"events", href: "/events", label: "Evenementen", icon: CalendarDays, roles: ["employee","responsible_lead","admin"] },
  { key:"workplaces", href: "/workplaces", label: "Werkplekken", icon: MapPin, roles: ["employee","responsible_lead","admin"] },
  { key:"shifts", href: "/shifts", label: "Diensten", icon: Clock3, roles: ["employee","responsible_lead","admin"] },
  { key:"briefings", href: "/briefings", label: "Instructies", icon: ScrollText, roles: ["employee","responsible_lead","admin"] },
  { key:"tasks", href: "/tasks", label: "Taken", icon: ScrollText, roles: ["employee","responsible_lead","admin"] },
  { key:"chat", href: "/chat", label: "Gesprekken", icon: Users, roles: ["employee","responsible_lead","admin"] },
  { key:"crew", href: "/crew", label: "Personeel", icon: Users, roles: ["employee","responsible_lead","admin"] },
  { key:"incidents", href: "/incidents", label: "Incidenten", icon: AlertTriangle, roles: ["employee","responsible_lead","admin"] },
  { key:"exports", href: "/exports", label: "Excel", icon: ScrollText, roles: ["admin"] },
  { key:"personnel", href: "/personnel", label: "Personeel & goedkeuringen", icon: Users, roles: ["admin"] },
  { key:"settings", href: "/settings", label: "Instellingen", icon: Settings, roles: ["employee","responsible_lead","admin"] },
]

export function AppSidebar({
  chatMissed=0,incidentMissed=0,taskMissed=0,
  showOperations=false,showEvents=false,showTasks=false,showBriefings=false,showShifts=false,showWorkplaces=false,showIncidents=false,
  featureOrder=[],featureLabels={},featureVisibility={},
}:{
  chatMissed?:number;incidentMissed?:number;taskMissed?:number;
  showOperations?:boolean;showEvents?:boolean;showTasks?:boolean;showBriefings?:boolean;showShifts?:boolean;showWorkplaces?:boolean;showIncidents?:boolean;
  featureOrder?:string[];featureLabels?:Record<string,string>;featureVisibility?:Record<string,boolean>;
}) {
 const pathname=usePathname()
 const {roles,isAdmin,testMode}=useAuth()
 const order=new Map(featureOrder.map((key,index)=>[key,index]))
 const visible=items.filter(i=>{
   if(!roles.some(r=>i.roles.includes(r))) return false
   if(Object.prototype.hasOwnProperty.call(featureVisibility,i.key)&&!featureVisibility[i.key]) return false
   if(i.key==="operations") return showOperations
   if(i.key==="events") return showEvents
   if(i.key==="tasks") return showTasks
   if(i.key==="briefings") return showBriefings
   if(i.key==="workplaces") return showWorkplaces
   if(i.key==="shifts") return showShifts
   if(i.key==="incidents") return showIncidents
   return true
 }).sort((a,b)=>(order.get(a.key)??999)-(order.get(b.key)??999))

 return <aside className="hidden md:flex w-[250px] h-screen sticky top-0 flex-col border-r border-border bg-card">
  <Link href={isAdmin&&!testMode?"/admin":"/"} className="h-16 flex items-center gap-3 px-5 border-b border-border">
   <Image src="/up-till-dawn-mark.webp" alt="UP TILL DAWN" width={36} height={36} className="h-9 w-9 rounded-xl object-cover" priority />
   <div><div className="font-black tracking-wide">UP TILL DAWN</div><div className="text-[10px] text-muted-foreground tracking-[.18em]">PERSONEELSBEHEER</div></div>
  </Link>
  <nav className="p-3 space-y-1">{visible.map(i=>{
   const href=i.href==='/'&&isAdmin&&!testMode?'/admin':i.href
   const active=href==='/'?pathname==='/':pathname.startsWith(href)
   const Icon=i.icon
   const count=i.key==="chat"?chatMissed:i.key==="incidents"?incidentMissed:i.key==="tasks"?taskMissed:0
   const fallbackLabel=i.key==="operations"&&isAdmin?"Werkuren":i.label
   return <Link data-layout-key={i.key} key={i.key} href={href} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold",active?"bg-violet-600 text-white":"text-muted-foreground hover:bg-muted hover:text-foreground")}>
    <span className="relative"><Icon className="h-5 w-5"/>{count>0&&<span className="absolute -right-3 -top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black leading-none text-white">{count>99?"99+":count}</span>}</span>{featureLabels[i.key] || fallbackLabel}
   </Link>
  })}</nav>
  <div className="mt-auto p-4"><div className="text-[11px] text-muted-foreground flex gap-2"><Shield className="h-4 w-4"/>Beveiligde personeelsoperaties</div></div>
 </aside>
}
