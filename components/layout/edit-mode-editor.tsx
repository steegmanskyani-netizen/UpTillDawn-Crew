"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/crew-client"
import { useAuth, type UiRole } from "@/lib/providers"
import { getDefaultRoleUiRules, type RoleCondition, type RoleUiRule } from "@/lib/role-ui"

const conditions: Array<{value:RoleCondition;label:string}> = [
  { value: "always", label: "Altijd" },
  { value: "assigned_event", label: "Na evenementtoewijzing" },
  { value: "assigned_workplace_role", label: "Na werkplek/roltoewijzing" },
  { value: "event_active", label: "Tijdens evenement" },
  { value: "shift_active", label: "Tijdens actieve shift" },
  { value: "never", label: "Nooit" },
]

const editRoles: Array<{value:UiRole;label:string}> = [
  { value: "admin", label: "Admin" },
  { value: "employee", label: "Personeel" },
  { value: "responsible_lead", label: "Verantwoordelijke" },
]

type AiPatch = {
  feature_key: string
  label: string | null
  visible: boolean | null
  enabled: boolean | null
  condition_key: RoleCondition | null
  sort_order: number | null
}

type AiReply = {
  answer: string
  patches: AiPatch[]
}

export function EditModeEditor() {
  const router = useRouter()
  const {
    user,
    realIsAdmin,
    isOwner,
    editMode,
    editRole,
    setEditRole,
    setEditMode,
    roleMode,
  } = useAuth()
  const [rules, setRules] = useState<RoleUiRule[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [collapsed, setCollapsed] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiBusy, setAiBusy] = useState(false)
  const [aiReply, setAiReply] = useState<AiReply | null>(null)
  const [aiError, setAiError] = useState("")
  const db = useMemo(() => createClient(), [])

  const role = editRole === "responsible_lead" ? "responsible_lead" : editRole === "admin" ? "admin" : "staff"
  const currentUiRole:UiRole = role === "staff" ? "employee" : role

  useEffect(() => {
    if (!realIsAdmin || !editMode) return
    let alive = true
    ;(async () => {
      const { data } = await db
        .from("role_ui_rules")
        .select("role,feature_key,label,group_key,visible,enabled,condition_key,sort_order,settings")
        .eq("role", role)
        .order("sort_order")
      if (alive) setRules((data?.length ? data : getDefaultRoleUiRules(role)) as RoleUiRule[])
    })()
    return () => { alive = false }
  }, [db, realIsAdmin, role, editMode])

  if (!realIsAdmin || !editMode) return null

  function patch(key:string, changes:Partial<RoleUiRule>) {
    setRules(current => current.map(rule => rule.feature_key === key ? { ...rule, ...changes } : rule))
  }

  function changeEditRole(next:UiRole) {
    setEditRole(next)
    setMessage("")
    setAiReply(null)
    setAiError("")
  }

  function dropOn(targetKey:string) {
    if (!dragKey || dragKey === targetKey) return
    setRules(current => {
      const next = [...current]
      const from = next.findIndex(r => r.feature_key === dragKey)
      const to = next.findIndex(r => r.feature_key === targetKey)
      if (from < 0 || to < 0) return current
      const [moved] = next.splice(from,1)
      next.splice(to,0,moved)
      return next.map((rule,index) => ({ ...rule, sort_order: (index + 1) * 10 }))
    })
    setDragKey(null)
  }

  function loadDefaults() {
    setRules(getDefaultRoleUiRules(role))
    setMessage("Opgeslagen standaard geladen. Klik op opslaan om deze opnieuw toe te passen.")
  }

  async function save() {
    if (!user) return
    setBusy(true)
    setMessage("")
    const payload = rules.map((rule,index) => ({
      role,
      feature_key: rule.feature_key,
      label: rule.label,
      group_key: rule.group_key || "navigation",
      visible: rule.visible,
      enabled: rule.enabled,
      condition_key: rule.condition_key,
      sort_order: (index + 1) * 10,
      settings: rule.settings || {},
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await db.from("role_ui_rules").upsert(payload, { onConflict: "role,feature_key" })
    if (error) {
      setMessage("Opslaan mislukt. Controleer je rechten en verbinding.")
    } else {
      setRules(current => current.map((rule,index) => ({...rule,sort_order:(index+1)*10})))
      setMessage("Edit-layout en rolrechten opgeslagen.")
      window.dispatchEvent(new CustomEvent("uptilldawn-role-rules-updated"))
    }
    setBusy(false)
  }

  async function askAi() {
    const prompt=aiPrompt.trim()
    if (!prompt || aiBusy) return
    setAiBusy(true)
    setAiError("")
    setAiReply(null)
    try {
      const response=await fetch("/api/edit-assistant",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          message:prompt,
          role,
          path:window.location.pathname,
          rules,
        }),
      })
      const payload=await response.json().catch(()=>null) as (AiReply & {error?:string}) | null
      if (!response.ok || !payload) {
        setAiError(payload?.error || "AI kon niet antwoorden.")
        return
      }
      setAiReply({answer:payload.answer,patches:Array.isArray(payload.patches)?payload.patches:[]})
    } catch {
      setAiError("AI kon niet worden bereikt.")
    } finally {
      setAiBusy(false)
    }
  }

  function applyAiPatches() {
    if (!aiReply?.patches.length) return
    setRules(current => {
      const validKeys=new Set(current.map(rule=>rule.feature_key))
      const patches=aiReply.patches.filter(item=>validKeys.has(item.feature_key))
      const byKey=new Map(patches.map(item=>[item.feature_key,item]))
      const updated=current.map(rule=>{
        const ai=byKey.get(rule.feature_key)
        if(!ai)return rule
        return {
          ...rule,
          ...(ai.label!==null?{label:ai.label.slice(0,80)}:{}),
          ...(ai.visible!==null?{visible:ai.visible}:{}),
          ...(ai.enabled!==null?{enabled:ai.enabled}:{}),
          ...(ai.condition_key!==null?{condition_key:ai.condition_key}:{}),
          ...(ai.sort_order!==null?{sort_order:ai.sort_order}:{}),
        }
      })
      return updated
        .sort((a,b)=>a.sort_order-b.sort_order)
        .map((rule,index)=>({...rule,sort_order:(index+1)*10}))
    })
    setMessage("AI-wijzigingen toegepast in de editor. Controleer ze en klik daarna op opslaan.")
    setAiReply(current=>current?{...current,patches:[]}:current)
  }

  async function closeEditMode() {
    await db.rpc("upt_revoke_admin_edit_unlock")
    setEditMode(false)
    router.push(roleMode === "admin" ? "/admin" : "/")
    router.refresh()
  }

  return <aside className="fixed right-3 top-20 z-[80] flex max-h-[calc(100dvh-6rem)] w-[min(460px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-amber-400/50 bg-card shadow-2xl print:hidden">
    <div className="border-b p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black tracking-widest text-amber-400">EDIT MODE</p>
          <p className="font-bold">{role === "staff" ? "Personeel" : role === "responsible_lead" ? "Verantwoordelijke" : "Beheerder"} · layout & rechten</p>
        </div>
        <button type="button" onClick={() => setCollapsed(value => !value)} className="rounded-lg border px-3 py-2 text-xs">
          {collapsed ? "Open editor" : "Verberg editor"}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border p-1" aria-label="Edit rol">
        {editRoles.map(item=><button
          key={item.value}
          type="button"
          aria-pressed={currentUiRole===item.value}
          onClick={()=>changeEditRole(item.value)}
          className={`rounded-lg px-2 py-2 text-xs font-bold ${currentUiRole===item.value?"bg-violet-600 text-white":"hover:bg-muted"}`}
        >{item.label}</button>)}
      </div>
    </div>

    {!collapsed && <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <p className="text-xs text-muted-foreground">Sleep elementen om te herschikken. Zichtbaar en bruikbaar worden na opslaan live toegepast voor alle gebruikers van deze rol.</p>

      {isOwner&&<section className="space-y-2 rounded-xl border border-violet-500/40 bg-violet-500/5 p-3">
        <div>
          <p className="font-black">AI app-editor</p>
          <p className="text-xs text-muted-foreground">Beschrijf wat je wilt wijzigen. De AI draait via Cloudflare Workers AI en krijgt de huidige rol en Edit-layout mee om toepasbare wijzigingen voor te stellen.</p>
        </div>
        <textarea
          value={aiPrompt}
          onChange={event=>setAiPrompt(event.target.value)}
          maxLength={4000}
          rows={4}
          placeholder="Bijv. zet Chat boven Taken en verberg Exports voor Personeel."
          className="w-full resize-y rounded-xl border bg-background p-3 text-sm"
        />
        <button
          type="button"
          disabled={aiBusy||!aiPrompt.trim()}
          onClick={()=>void askAi()}
          className="w-full rounded-xl bg-violet-600 px-4 py-2 font-black text-white disabled:opacity-50"
        >
          {aiBusy?"AI DENKT…":"VRAAG AI"}
        </button>
        {aiError&&<p role="alert" className="rounded-lg border border-red-500/40 p-2 text-sm text-red-500">{aiError}</p>}
        {aiReply&&<div className="space-y-2 rounded-xl border bg-background p-3">
          <p className="whitespace-pre-wrap text-sm">{aiReply.answer}</p>
          {aiReply.patches.length>0&&<button
            type="button"
            onClick={applyAiPatches}
            className="w-full rounded-xl border border-violet-500/60 px-3 py-2 text-sm font-black"
          >
            {aiReply.patches.length} WIJZIGING{aiReply.patches.length===1?"":"EN"} TOEPASSEN
          </button>}
        </div>}
      </section>}

      {rules.map(rule => <div
        key={rule.feature_key}
        draggable
        onDragStart={() => setDragKey(rule.feature_key)}
        onDragOver={event => event.preventDefault()}
        onDrop={() => dropOn(rule.feature_key)}
        className="rounded-xl border p-3"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="cursor-grab font-semibold">☰ {rule.label}</span>
          <span className="text-[10px] text-muted-foreground">{rule.feature_key}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs sm:col-span-2">
            Label
            <input value={rule.label} maxLength={80} onChange={e => patch(rule.feature_key,{label:e.target.value})} className="rounded-lg border bg-background p-2 text-sm"/>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={rule.visible} onChange={e => patch(rule.feature_key,{visible:e.target.checked})}/>
            Zichtbaar
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={rule.enabled} onChange={e => patch(rule.feature_key,{enabled:e.target.checked})}/>
            Bruikbaar
          </label>
          <label className="grid gap-1 text-xs sm:col-span-2">
            Wanneer zichtbaar/bruikbaar
            <select value={rule.condition_key} onChange={e => patch(rule.feature_key,{condition_key:e.target.value as RoleCondition})} className="rounded-lg border bg-background p-2 text-sm">
              {conditions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </div>)}
      {message && <p role="status" className="rounded-lg border p-2 text-sm">{message}</p>}
    </div>}

    <div className="space-y-2 border-t p-3">
      {!collapsed&&<div className="grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={busy} onClick={loadDefaults} className="rounded-xl border p-3 font-bold disabled:opacity-50">
          STANDAARD LADEN
        </button>
        <button type="button" disabled={busy} onClick={save} className="rounded-xl bg-violet-600 p-3 font-black text-white disabled:opacity-50">
          {busy ? "OPSLAAN…" : "EDITLAYOUT & ROLRECHTEN OPSLAAN"}
        </button>
      </div>}
      <button
        type="button"
        onClick={()=>void closeEditMode()}
        className="w-full rounded-xl border border-amber-500/60 bg-amber-500/10 p-3 font-black"
      >
        EDIT MODE AFSLUITEN
      </button>
    </div>
  </aside>
}
