"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { MobileBottomNav } from "@/components/layout/mobile-nav"
import { FloatingChatButton } from "@/components/layout/floating-chat-button"
import { TestModeEditor } from "@/components/layout/test-mode-editor"
import { QueueStatus } from "@/components/crew/queue-status"
import { createClient } from "@/lib/supabase/crew-client"
import { useAuth } from "@/lib/providers"
import { ruleMatches, ruleUsable, type RoleUiContext, type RoleUiRule } from "@/lib/role-ui"

function CountBadge({ count }: { count: number }) {
  if (count < 1) return null
  return <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-black leading-none text-white shadow ring-2 ring-background">{count>99?"99+":count}</span>
}

const emptyContext:RoleUiContext={assignedEvent:false,assignedWorkplaceRole:false,eventActive:false,shiftActive:false}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname=usePathname()
  const {user,profile,isAdmin,testMode,testRole}=useAuth()
  const supabase=useMemo(()=>createClient(),[])
  const [chatMissed,setChatMissed]=useState(0)
  const [incidentMissed,setIncidentMissed]=useState(0)
  const [taskMissed,setTaskMissed]=useState(0)
  const [context,setContext]=useState<RoleUiContext>(emptyContext)
  const [rules,setRules]=useState<RoleUiRule[]>([])

  const roleKey=testMode&&testRole==="responsible_lead"?"responsible_lead":testMode?"staff":profile?.role==="responsible_lead"?"responsible_lead":profile?.role==="staff"?"staff":null

  const loadRules=useCallback(async()=>{
    if(!roleKey){setRules([]);return}
    const {data}=await supabase.from("role_ui_rules").select("role,feature_key,label,group_key,visible,enabled,condition_key,sort_order,settings").eq("role",roleKey).order("sort_order")
    setRules((data||[]) as RoleUiRule[])
  },[roleKey,supabase])

  useEffect(()=>{const first=window.setTimeout(()=>void loadRules(),0);const fn=()=>void loadRules();window.addEventListener("uptilldawn-role-rules-updated",fn);return()=>{window.clearTimeout(first);window.removeEventListener("uptilldawn-role-rules-updated",fn)}},[loadRules])

  const ruleMap=useMemo(()=>new Map(rules.map(rule=>[rule.feature_key,rule])),[rules])
  const previewAll=Boolean(isAdmin&&testMode)
  const feature=(key:string,fallback:boolean)=>{
    if(isAdmin&&!testMode) return fallback
    const rule=ruleMap.get(key)
    return rule?ruleMatches(rule,context,previewAll):fallback
  }
  const order=rules.map(rule=>rule.feature_key)
  const labels=Object.fromEntries(rules.map(rule=>[rule.feature_key,rule.label]))

  const currentFeature=
    pathname==="/"?"overview":
    pathname.startsWith("/events")?"events":
    pathname.startsWith("/operations")?"operations":
    pathname.startsWith("/workplaces")?"workplaces":
    pathname.startsWith("/shifts")?"shifts":
    pathname.startsWith("/briefings")?"briefings":
    pathname.startsWith("/tasks")?"tasks":
    pathname.startsWith("/chat")?"chat":
    pathname.startsWith("/crew")?"crew":
    pathname.startsWith("/incidents")?"incidents":
    null
  const currentRule=currentFeature?ruleMap.get(currentFeature):undefined
  const rulesReady=!roleKey||rules.length>0
  const currentVisible=!currentFeature||!roleKey||!rulesReady||previewAll||ruleMatches(currentRule,context,false)
  const currentUsable=!currentFeature||!roleKey||!rulesReady||(isAdmin&&!testMode)||ruleUsable(currentRule,context,false)
  const contentLocked=Boolean(testMode||(currentVisible&&!currentUsable))

  const refresh=useCallback(async()=>{
    if(!user)return
    const now=new Date()
    const nowIso=now.toISOString()
    const chatKey=`uptilldawn-last-chat-view:${user.id}`
    const incidentKey=`uptilldawn-last-incidents-view:${user.id}`
    const taskKey=`uptilldawn-last-tasks-view:${user.id}`
    let chatSince=window.localStorage.getItem(chatKey)
    let incidentSince=window.localStorage.getItem(incidentKey)
    const taskSince=window.localStorage.getItem(taskKey)||"1970-01-01T00:00:00.000Z"
    if(!chatSince){chatSince=nowIso;window.localStorage.setItem(chatKey,chatSince)}
    if(!incidentSince){incidentSince=nowIso;window.localStorage.setItem(incidentKey,incidentSince)}

    const [{data:events},{data:memberships},{data:shifts},{data:responsibleAssignments}]=await Promise.all([
      supabase.from("events").select("id,start_at,end_at,status").neq("status","archived").gte("end_at",nowIso),
      supabase.from("event_members").select("event_id,event_role").eq("user_id",user.id),
      supabase.from("shifts").select("event_id,workplace_id,scheduled_start,scheduled_end,status").eq("user_id",user.id).neq("status","cancelled"),
      supabase.from("responsible_assignments").select("event_id,workplace_id").eq("user_id",user.id),
    ])
    const eventRows=events||[]
    const memberIds=new Set((memberships||[]).map(x=>x.event_id))
    const assignedEvent=eventRows.some(e=>memberIds.has(e.id))
    const eventActive=eventRows.some(e=>memberIds.has(e.id)&&Date.parse(e.start_at)<=now.getTime()&&Date.parse(e.end_at)>=now.getTime())
    const shiftActive=(shifts||[]).some(s=>Date.parse(s.scheduled_start)<=now.getTime()&&Date.parse(s.scheduled_end)>=now.getTime())
    const assignedWorkplaceRole=(shifts||[]).length>0||(responsibleAssignments||[]).length>0
    setContext({assignedEvent,assignedWorkplaceRole,eventActive,shiftActive})

    if(pathname.startsWith("/tasks")){window.localStorage.setItem(taskKey,nowIso);setTaskMissed(0)}
    else{
      const {count}=await supabase.from("task_assignments").select("id",{count:"exact",head:true}).gt("created_at",taskSince).neq("status","COMPLETED")
      setTaskMissed(count??0)
    }

    if(pathname.startsWith("/chat")){window.localStorage.setItem(chatKey,nowIso);setChatMissed(0)}
    else{
      const {count}=await supabase.from("messages").select("id",{count:"exact",head:true}).gt("created_at",chatSince).neq("sender_id",user.id)
      setChatMissed(count??0)
    }

    if(pathname.startsWith("/incidents")){window.localStorage.setItem(incidentKey,nowIso);setIncidentMissed(0)}
    else{
      let query=supabase.from("incidents").select("id",{count:"exact",head:true}).gt("created_at",incidentSince)
      if(profile?.role==="staff") query=query.eq("reporter_id",user.id)
      const {count}=await query
      setIncidentMissed(count??0)
    }
  },[pathname,profile?.role,supabase,user])

  useEffect(()=>{queueMicrotask(()=>void refresh());const timer=window.setInterval(()=>void refresh(),10000);const focus=()=>void refresh();window.addEventListener("focus",focus);return()=>{window.clearInterval(timer);window.removeEventListener("focus",focus)}},[refresh])

  const showEvents=feature("events",true)
  const showShifts=feature("shifts",context.assignedEvent)
  const showBriefings=feature("briefings",context.assignedEvent)
  const showOperations=isAdmin&&!testMode?false:feature("operations",context.shiftActive)
  const showWorkplaces=feature("workplaces",context.assignedWorkplaceRole)
  const showTasks=isAdmin&&!testMode?true:feature("tasks",context.shiftActive)
  const showIncidents=isAdmin&&!testMode?context.eventActive:feature("incidents",context.shiftActive)
  const operationalMode=context.eventActive||previewAll
  const showUrgent=!pathname.startsWith("/chat")&&!isAdmin&&showIncidents&&context.shiftActive

  return <div className="flex h-dvh overflow-hidden bg-background print:block print:h-auto print:overflow-visible">
    <div className="print:hidden"><AppSidebar chatMissed={chatMissed} incidentMissed={incidentMissed} taskMissed={taskMissed} showOperations={showOperations} showEvents={showEvents} showTasks={showTasks} showBriefings={showBriefings} showShifts={showShifts} showWorkplaces={showWorkplaces} showIncidents={showIncidents} featureOrder={order} featureLabels={labels}/></div>
    <div className="flex flex-1 flex-col overflow-hidden print:block print:overflow-visible">
      <div className="print:hidden"><Topbar/><QueueStatus/></div>
      <div id="app-scroll" className="flex-1 overflow-y-auto bg-background scroll-smooth print:overflow-visible">
        <main className="min-h-[calc(100dvh-theme(spacing.16)-theme(spacing.12))] pb-20 md:pb-0 print:min-h-0 print:pb-0">
          {testMode&&<p className="m-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm font-semibold">Testmodus preview: operationele interacties zijn geblokkeerd. Pas volgorde, labels, zichtbaarheid, bruikbaarheid en voorwaarden aan in de editor.</p>}
          {!currentVisible&&!previewAll
            ? <div className="m-4 rounded-2xl border p-6 text-muted-foreground">Deze functie is verborgen voor jouw rol of huidige context.</div>
            : <>
                {!testMode&&!currentUsable&&<p className="m-3 rounded-xl border p-3 text-sm text-muted-foreground">Alleen-lezen: deze functie is zichtbaar, maar momenteel niet bruikbaar voor jouw rol.</p>}
                <div inert={contentLocked}>{children}</div>
              </>}
        </main>
      </div>
      <div className="print:hidden"><MobileBottomNav taskMissed={taskMissed} operationalMode={operationalMode} showOperations={showOperations} showEvents={showEvents} showTasks={showTasks} showBriefings={showBriefings} showShifts={showShifts} featureOrder={order} featureLabels={labels}/></div>
    </div>
    {!pathname.startsWith("/chat")&&<>
      {showUrgent&&<Link href="/incidents" className="fixed bottom-20 left-4 z-50 rounded-full bg-red-600 px-5 py-4 font-black text-white print:hidden md:hidden">URGENT<CountBadge count={incidentMissed}/></Link>}
      <FloatingChatButton count={chatMissed}/>
    </>}
    <TestModeEditor/>
  </div>
}
