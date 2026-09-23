"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/providers"
import { cn } from "@/lib/utils"
import { LayoutDashboard, CalendarDays, MapPin, Clock3, AlertTriangle, Users, Shield, Settings, ScrollText } from "lucide-react"

const items = [
  { href: "/operations", label: "Werk & pauze", icon: Clock3, roles: ["employee","responsible_lead","admin"] },
  { href: "/briefings", label: "Briefings", icon: ScrollText, roles: ["employee","responsible_lead","admin"] },
  { href: "/tasks", label: "Taken", icon: ScrollText, roles: ["employee","responsible_lead","admin"] },
  { href: "/chat", label: "Chat", icon: Users, roles: ["employee","responsible_lead","admin"] },
  { href: "/crew", label: "Crew", icon: Users, roles: ["employee","responsible_lead","admin"] },
  { href: "/exports", label: "Excel", icon: ScrollText, roles: ["admin"] },
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["employee","responsible_lead","admin"] },
  { href: "/events", label: "Events", icon: CalendarDays, roles: ["employee","responsible_lead","admin"] },
  { href: "/workplaces", label: "Werkplekken", icon: MapPin, roles: ["responsible_lead","admin"] },
  { href: "/shifts", label: "Shifts", icon: Clock3, roles: ["employee","responsible_lead","admin"] },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle, roles: ["responsible_lead","admin"] },
  { href: "/personnel", label: "Personeel", icon: Users, roles: ["admin"] },
  { href: "/audit", label: "Auditlog", icon: ScrollText, roles: ["admin"] },
  { href: "/settings", label: "Instellingen", icon: Settings, roles: ["employee","responsible_lead","admin"] },
]

export function AppSidebar() {
  const pathname = usePathname(); const { roles } = useAuth()
  const visible = items.filter(i => roles.some(r => i.roles.includes(r)))
  return <aside className="hidden md:flex w-[250px] h-screen sticky top-0 flex-col border-r border-border bg-card">
    <Link href={roles.includes("admin") ? "/admin" : "/"} className="h-16 flex items-center gap-3 px-5 border-b border-border">
      <div className="h-9 w-9 rounded-xl bg-violet-600 text-white grid place-items-center font-black">U</div>
      <div><div className="font-black tracking-wide">UPTILLDAWN</div><div className="text-[10px] text-muted-foreground tracking-[.18em]">CREW MANAGEMENT</div></div>
    </Link>
    <nav className="p-3 space-y-1">{visible.map(i => { const href=i.href==='/'&&roles.includes('admin')?'/admin':i.href; const active=href==='/'?pathname==='/':pathname.startsWith(href); const Icon=i.icon; return <Link key={i.href} href={href} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold", active?"bg-violet-600 text-white":"text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="h-5 w-5"/>{i.label}</Link> })}</nav>
    <div className="mt-auto p-4 text-[11px] text-muted-foreground flex gap-2"><Shield className="h-4 w-4"/>Beveiligde crew-operaties</div>
  </aside>
}
