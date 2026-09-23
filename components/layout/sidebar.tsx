"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/providers"
import { cn } from "@/lib/utils"
import { LayoutDashboard, CalendarDays, MapPin, Clock3, AlertTriangle, Users, Shield, Settings, ScrollText } from "lucide-react"

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["employee","responsible_lead","admin"] },
  { href: "/operations", label: "Werk & pauze", icon: Clock3, roles: ["employee","responsible_lead","admin"] },
  { href: "/events", label: "Events", icon: CalendarDays, roles: ["employee","responsible_lead","admin"] },
  { href: "/workplaces", label: "Werkplekken", icon: MapPin, roles: ["responsible_lead","admin"] },
  { href: "/shifts", label: "Shifts", icon: Clock3, roles: ["employee","responsible_lead","admin"] },
  { href: "/briefings", label: "Briefings", icon: ScrollText, roles: ["employee","responsible_lead","admin"] },
  { href: "/tasks", label: "Taken", icon: ScrollText, roles: ["employee","responsible_lead","admin"] },
  { href: "/chat", label: "Chat", icon: Users, roles: ["employee","responsible_lead","admin"] },
  { href: "/crew", label: "Crew", icon: Users, roles: ["employee","responsible_lead","admin"] },
  { href: "/incidents", label: "Incidenten", icon: AlertTriangle, roles: ["responsible_lead","admin"] },
  { href: "/exports", label: "Excel", icon: ScrollText, roles: ["admin"] },
  { href: "/personnel", label: "Personeel", icon: Users, roles: ["admin"] },
  { href: "/audit", label: "Auditlog", icon: ScrollText, roles: ["admin"] },
  { href: "/settings", label: "Instellingen", icon: Settings, roles: ["employee","responsible_lead","admin"] },
]

export function AppSidebar({ chatMissed = 0, incidentMissed = 0 }: { chatMissed?: number; incidentMissed?: number }) {
  const pathname = usePathname(); const { roles, isAdmin, testRole, setTestRole } = useAuth()
  const visible = items.filter(i => roles.some(r => i.roles.includes(r)))
  return <aside className="hidden md:flex w-[250px] h-screen sticky top-0 flex-col border-r border-border bg-card">
    <Link href={roles.includes("admin") ? "/admin" : "/"} className="h-16 flex items-center gap-3 px-5 border-b border-border">
      <Image src="/up-till-dawn-mark.webp" alt="UP TILL DAWN" width={36} height={36} className="h-9 w-9 rounded-xl object-cover" priority />
      <div><div className="font-black tracking-wide">UP TILL DAWN</div><div className="text-[10px] text-muted-foreground tracking-[.18em]">CREW MANAGEMENT</div></div>
    </Link>
    <nav className="p-3 space-y-1">{visible.map(i => { const href=i.href==='/'&&roles.includes('admin')?'/admin':i.href; const active=href==='/'?pathname==='/':pathname.startsWith(href); const Icon=i.icon; return <Link key={i.href} href={href} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold", active?"bg-violet-600 text-white":"text-muted-foreground hover:bg-muted hover:text-foreground")}><span className="relative"><Icon className="h-5 w-5"/>{((i.href === "/chat" ? chatMissed : i.href === "/incidents" ? incidentMissed : 0) > 0) && <span className="absolute -right-3 -top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black leading-none text-white">{(i.href === "/chat" ? chatMissed : incidentMissed) > 99 ? "99+" : (i.href === "/chat" ? chatMissed : incidentMissed)}</span>}</span>{i.label}</Link> })}</nav>
    <div className="mt-auto space-y-2 p-4">{isAdmin && !testRole && <div className="grid gap-1"><button onClick={()=>setTestRole("employee")} className="rounded-lg border p-2 text-xs font-semibold">Test als Employee</button><button onClick={()=>setTestRole("responsible_lead")} className="rounded-lg border p-2 text-xs font-semibold">Test als Responsible</button></div>}<div className="text-[11px] text-muted-foreground flex gap-2"><Shield className="h-4 w-4"/>Beveiligde crew-operaties</div></div>
  </aside>
}
