"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/providers"
import { cn } from "@/lib/utils"
import { LayoutDashboard, CalendarDays, Clock3, Users, ListChecks, ScrollText, MessageCircle } from "lucide-react"

const beforeItems=[
 {key:"overview",href:"/",label:"Overzicht",icon:LayoutDashboard},
 {key:"events",href:"/events",label:"Evenementen",icon:CalendarDays},
 {key:"crew",href:"/crew",label:"Personeel",icon:Users},
 {key:"chat",href:"/chat",label:"Gesprekken",icon:MessageCircle},
]
const operationalItems=[
 {key:"shifts",href:"/shifts",label:"Diensten",icon:Clock3},
 {key:"briefings",href:"/briefings",label:"Instructies",icon:ScrollText},
 {key:"operations",href:"/operations",label:"Werk",icon:Clock3},
 {key:"tasks",href:"/tasks",label:"Taken",icon:ListChecks},
]

export function MobileBottomNav({
 taskMissed=0,operationalMode=false,showOperations=false,showEvents=true,showTasks=false,showBriefings=false,showShifts=false,featureOrder=[],featureLabels={},featureVisibility={},
}:{
 taskMissed?:number;operationalMode?:boolean;showOperations?:boolean;showEvents?:boolean;showTasks?:boolean;showBriefings?:boolean;showShifts?:boolean;featureOrder?:string[];featureLabels?:Record<string,string>;featureVisibility?:Record<string,boolean>;
}) {
 const pathname=usePathname()
 const {roles,isAdmin,testMode}=useAuth()
 const order=new Map(featureOrder.map((key,index)=>[key,index]))
 let items=(operationalMode&&!isAdmin?operationalItems:beforeItems).filter(i=>{
   if(Object.prototype.hasOwnProperty.call(featureVisibility,i.key)&&!featureVisibility[i.key]) return false
   if(i.key==="events") return showEvents
   if(i.key==="operations") return showOperations
   if(i.key==="tasks") return roles.includes("responsible_lead")&&showTasks
   if(i.key==="briefings") return showBriefings
   if(i.key==="shifts") return showShifts
   return true
 })
 if(isAdmin&&!testMode) items=beforeItems.filter(i=>i.key!=="chat")
 items=[...items].sort((a,b)=>(order.get(a.key)??999)-(order.get(b.key)??999))
 return <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-border bg-card/95 backdrop-blur p-1.5 md:hidden">
  {items.map(i=>{
   const href=i.href==='/'&&isAdmin&&!testMode?'/admin':i.href
   const active=href==='/'?pathname==='/':pathname.startsWith(href)
   const I=i.icon
   const count=i.key==="tasks"?taskMissed:0
   return <Link data-layout-key={i.key} key={i.key} href={href} className={cn("flex min-w-14 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold",active?"text-violet-400":"text-muted-foreground")}>
    <span className="relative"><I className="h-5 w-5"/>{count>0&&<span className="absolute -right-3 -top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black leading-none text-white shadow ring-2 ring-card">{count>99?"99+":count}</span>}</span>
    {featureLabels[i.key] || i.label}
   </Link>
  })}
 </nav>
}
