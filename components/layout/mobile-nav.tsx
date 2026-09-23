"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/providers"
import { cn } from "@/lib/utils"
import { LayoutDashboard, CalendarDays, Clock3, AlertTriangle, Users } from "lucide-react"
const items=[
 {href:"/",label:"Dashboard",icon:LayoutDashboard,roles:["employee","responsible_lead","admin"]},
 {href:"/events",label:"Events",icon:CalendarDays,roles:["employee","responsible_lead","admin"]},
 {href:"/operations",label:"Werk",icon:Clock3,roles:["employee","responsible_lead","admin"]},
 {href:"/incidents",label:"Incidenten",icon:AlertTriangle,roles:["responsible_lead","admin"]},
 {href:"/crew",label:"Crew",icon:Users,roles:["employee","responsible_lead","admin"]},
]
export function MobileBottomNav(){const pathname=usePathname();const{roles}=useAuth();return <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-border bg-card/95 backdrop-blur p-1.5 md:hidden">{items.filter(i=>roles.some(r=>i.roles.includes(r))).map(i=>{const href=i.href==='/'&&roles.includes('admin')?'/admin':i.href;const I=i.icon;const a=href==='/'?pathname==='/':pathname.startsWith(href);return <Link key={i.href} href={href} className={cn("flex min-w-14 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold",a?"text-violet-400":"text-muted-foreground")}><I className="h-5 w-5"/>{i.label}</Link>})}</nav>}
