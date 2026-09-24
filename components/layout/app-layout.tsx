"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { MobileBottomNav } from "@/components/layout/mobile-nav"
import { FloatingChatButton } from "@/components/layout/floating-chat-button"
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
  const [taskMissed, setTaskMissed] = useState(0)
  const [hasActiveEvent, setHasActiveEvent] = useState(false)
  const [showOperations, setShowOperations] = useState(false)
  const [showEvents, setShowEvents] = useState(false)
  const [showTasks, setShowTasks] = useState(false)
  const [showBriefings, setShowBriefings] = useState(false)
  const [showShifts, setShowShifts] = useState(false)
  const [showWorkplaces, setShowWorkplaces] = useState(false)
  const [showIncidents, setShowIncidents] = useState(false)

  const refreshMissed = useCallback(async () => {
    if (!user) return

    const now = new Date().toISOString()
    const chatKey = `uptilldawn-last-chat-view:${user.id}`
    const incidentKey = `uptilldawn-last-incidents-view:${user.id}`
    const taskKey = `uptilldawn-last-tasks-view:${user.id}`
    let chatSince = window.localStorage.getItem(chatKey)
    let incidentSince = window.localStorage.getItem(incidentKey)
    const taskSince = window.localStorage.getItem(taskKey) || "1970-01-01T00:00:00.000Z"

    if (!chatSince) {
      chatSince = now
      window.localStorage.setItem(chatKey, chatSince)
    }
    if (!incidentSince) {
      incidentSince = now
      window.localStorage.setItem(incidentKey, incidentSince)
    }

    const supabase = createClient()

    const [{ data: activeEvents }, { data: openEvents }] = await Promise.all([
      supabase
        .from("events")
        .select("id")
        .lte("start_at", now)
        .gte("end_at", now),
      supabase
        .from("events")
        .select("id")
        .gte("end_at", now),
    ])

    const activeEventIds = (activeEvents || []).map(event => event.id)
    const openEventIds = new Set((openEvents || []).map(event => event.id))
    const active = activeEventIds.length > 0

    const realAdmin = roles.includes("admin") && testRole === null
    const effectiveResponsible = roles.includes("responsible_lead")
    const effectiveStaff = roles.includes("employee") && !effectiveResponsible && !roles.includes("admin")

    const [{ data: memberships }, { data: shifts }] = await Promise.all([
      supabase.from("event_members").select("event_id,event_role").eq("user_id", user.id),
      supabase.from("shifts").select("event_id").eq("user_id", user.id).neq("status", "cancelled"),
    ])

    const memberEventIds = new Set((memberships || []).map(row => row.event_id))
    const shiftEventIds = new Set((shifts || []).map(row => row.event_id))
    const responsibleEventIds = new Set(
      (memberships || [])
        .filter(row => row.event_role === "responsible_lead")
        .map(row => row.event_id),
    )
    const activeMemberEvents = activeEventIds.filter(id => memberEventIds.has(id) || shiftEventIds.has(id))
    const activeResponsibleEvents = activeEventIds.filter(id => responsibleEventIds.has(id))
    const hasOpenMemberEvent = [...memberEventIds].some(id => openEventIds.has(id))
    const hasOpenResponsibleEvent = [...responsibleEventIds].some(id => openEventIds.has(id))

    setShowEvents(true)

    if (realAdmin) {
      setShowOperations(active)
      setShowTasks(true)
      setShowBriefings(true)
      setShowShifts(true)
      setShowWorkplaces(true)
      setShowIncidents(active)
      setHasActiveEvent(active)
    } else if (effectiveResponsible) {
      setShowOperations(activeMemberEvents.length > 0 || activeResponsibleEvents.length > 0)
      setShowTasks(hasOpenResponsibleEvent)
      setShowBriefings(hasOpenResponsibleEvent)
      setShowShifts(hasOpenMemberEvent)
      setShowWorkplaces(hasOpenResponsibleEvent)
      setShowIncidents(activeResponsibleEvents.length > 0)
      setHasActiveEvent(activeMemberEvents.length > 0 || activeResponsibleEvents.length > 0)
    } else if (effectiveStaff) {
      setShowOperations(activeMemberEvents.length > 0)
      setShowTasks(hasOpenMemberEvent)
      setShowBriefings(hasOpenMemberEvent)
      setShowShifts(hasOpenMemberEvent)
      setShowWorkplaces(false)
      setShowIncidents(false)
      setHasActiveEvent(activeMemberEvents.length > 0)
    } else {
      setShowOperations(false)
      setShowTasks(false)
      setShowBriefings(false)
      setShowShifts(false)
      setShowWorkplaces(false)
      setShowIncidents(false)
      setHasActiveEvent(false)
    }

    if (pathname.startsWith("/tasks")) {
      window.localStorage.setItem(taskKey, now)
      setTaskMissed(0)
    } else {
      const { count } = await supabase
        .from("task_assignments")
        .select("id", { count: "exact", head: true })
        .gt("created_at", taskSince)
        .neq("status", "COMPLETED")
      setTaskMissed(count ?? 0)
    }

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
  }, [pathname, roles, testRole, user])

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
      <div className="print:hidden"><AppSidebar
        chatMissed={chatMissed}
        incidentMissed={incidentMissed}
        taskMissed={taskMissed}
        showOperations={showOperations}
        showEvents={showEvents}
        showTasks={showTasks}
        showBriefings={showBriefings}
        showShifts={showShifts}
        showWorkplaces={showWorkplaces}
        showIncidents={showIncidents}
      /></div>
      <div className="flex flex-1 flex-col overflow-hidden print:block print:overflow-visible">
        <div className="print:hidden"><Topbar /><QueueStatus /></div>
        <div id="app-scroll" className="flex-1 overflow-y-auto bg-background scroll-smooth print:overflow-visible">
          <main className="min-h-[calc(100dvh-theme(spacing.16)-theme(spacing.12))] pb-20 md:pb-0 print:min-h-0 print:pb-0">
            {children}
          </main>
        </div>
        <div className="print:hidden"><MobileBottomNav
          incidentMissed={incidentMissed}
          taskMissed={taskMissed}
          showOperations={showOperations}
          showEvents={showEvents}
          showTasks={showTasks}
          showIncidents={showIncidents}
        /></div>
      </div>
      {!pathname.startsWith("/chat") && <>
        {(hasActiveEvent || testRole !== null) && <Link href="/incidents" className="fixed bottom-20 left-4 z-50 rounded-full bg-red-600 px-5 py-4 font-black text-white print:hidden md:hidden">
          URGENT
          <CountBadge count={incidentMissed} />
        </Link>}
        <FloatingChatButton count={chatMissed} />
      </>}
    </div>
  )
}
