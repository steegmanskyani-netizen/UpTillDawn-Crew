"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { MessageCircle } from "lucide-react"
import { AppSidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { MobileBottomNav } from "@/components/layout/mobile-nav"
import { QueueStatus } from "@/components/crew/queue-status"
import { createClient } from "@/lib/supabase/crew-client"
import { useAuth } from "@/lib/providers"

function CountBadge({ count }: { count: number }) {
  if (count < 1) return null
  return <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-black leading-none text-white shadow ring-2 ring-background">
    {count > 99 ? "99+" : count}
  </span>
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, roles, testRole } = useAuth()
  const [chatMissed, setChatMissed] = useState(0)
  const [incidentMissed, setIncidentMissed] = useState(0)
  const [hasActiveEvent, setHasActiveEvent] = useState(false)

  const refreshMissed = useCallback(async () => {
    if (!user) return

    const now = new Date().toISOString()
    const chatKey = `uptilldawn-last-chat-view:${user.id}`
    const incidentKey = `uptilldawn-last-incidents-view:${user.id}`
    let chatSince = window.localStorage.getItem(chatKey)
    let incidentSince = window.localStorage.getItem(incidentKey)

    if (!chatSince) {
      chatSince = now
      window.localStorage.setItem(chatKey, chatSince)
    }
    if (!incidentSince) {
      incidentSince = now
      window.localStorage.setItem(incidentKey, incidentSince)
    }

    const supabase = createClient()

    const { data: activeEvents } = await supabase
      .from("events")
      .select("id")
      .lte("start_at", now)
      .gte("end_at", now)
      .limit(1)
    setHasActiveEvent(Boolean(activeEvents?.length))

    if (pathname.startsWith("/chat")) {
      window.localStorage.setItem(chatKey, now)
      setChatMissed(0)
    } else {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .gt("created_at", chatSince)
        .neq("sender_id", user.id)
      setChatMissed(count ?? 0)
    }

    const canManageIncidents = roles.includes("responsible_lead") || roles.includes("admin")
    if (!canManageIncidents) {
      setIncidentMissed(0)
    } else if (pathname.startsWith("/incidents")) {
      window.localStorage.setItem(incidentKey, now)
      setIncidentMissed(0)
    } else {
      const { count } = await supabase
        .from("incidents")
        .select("id", { count: "exact", head: true })
        .gt("created_at", incidentSince)
      setIncidentMissed(count ?? 0)
    }
  }, [pathname, roles, user])

  useEffect(() => {
    queueMicrotask(() => void refreshMissed())
    const timer = window.setInterval(() => void refreshMissed(), 10_000)
    const onFocus = () => void refreshMissed()
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", onFocus)
    }
  }, [refreshMissed])

  return (
    <div className="flex h-dvh overflow-hidden bg-background print:block print:h-auto print:overflow-visible">
      <div className="print:hidden"><AppSidebar chatMissed={chatMissed} incidentMissed={incidentMissed} /></div>
      <div className="flex flex-1 flex-col overflow-hidden print:block print:overflow-visible">
        <div className="print:hidden"><Topbar /><QueueStatus /></div>
        <div id="app-scroll" className="flex-1 overflow-y-auto bg-background scroll-smooth print:overflow-visible">
          <main className="min-h-[calc(100dvh-theme(spacing.16)-theme(spacing.12))] pb-20 md:pb-0 print:min-h-0 print:pb-0">
            {children}
          </main>
        </div>
        <div className="print:hidden"><MobileBottomNav incidentMissed={incidentMissed} /></div>
      </div>
      {!pathname.startsWith("/chat") && <div className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-between print:hidden md:hidden">
        {(hasActiveEvent || testRole !== null) && <Link href="/incidents" className="relative rounded-full bg-red-600 px-5 py-4 font-black text-white">
          URGENT
          <CountBadge count={incidentMissed} />
        </Link>}
        <Link href="/chat" aria-label={chatMissed ? `Chat, ${chatMissed} gemiste berichten` : "Chat"} className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-black text-white shadow-lg">
          <MessageCircle className="h-7 w-7" />
          <CountBadge count={chatMissed} />
        </Link>
      </div>}
    </div>
  )
}
