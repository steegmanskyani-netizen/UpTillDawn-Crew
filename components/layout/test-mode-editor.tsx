"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/crew-client"
import { useAuth } from "@/lib/providers"
import type { RoleCondition, RoleUiRule } from "@/lib/role-ui"

const conditions: Array<{value:RoleCondition;label:string}> = [
  { value: "always", label: "Altijd" },
  { value: "assigned_event", label: "Na evenementtoewijzing" },
  { value: "assigned_workplace_role", label: "Na werkplek/roltoewijzing" },
  { value: "event_active", label: "Tijdens evenement" },
  { value: "shift_active", label: "Tijdens actieve shift" },
  { value: "never", label: "Nooit" },
]

export function TestModeEditor() {
  const { user, isAdmin, testMode, testRole } = useAuth()
  const [rules, setRules] = useState<RoleUiRule[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [collapsed, setCollapsed] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const db = useMemo(() => createClient(), [])

  const role = testRole === "responsible_lead" ? "responsible_lead" : "staff"

  useEffect(() => {
    if (!isAdmin || !testMode) return
    let alive = true
    ;(async () => {
      const { data } = await db
        .from("role_ui_rules")
        .select("role,feature_key,label,group_key,visible,enabled,condition_key,sort_order,settings")
        .eq("role", role)
        .order("sort_order")
      if (alive) setRules((data || []) as RoleUiRule[])
    })()
    return () => { alive = false }
  }, [db, isAdmin, role, testMode])

  if (!isAdmin || !testMode) return null

  function patch(key:string, changes:Partial<RoleUiRule>) {
    setRules(current => current.map(rule => rule.feature_key === key ? { ...rule, ...changes } : rule))
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
      setMessage("Testlayout en rolrechten opgeslagen.")
      window.dispatchEvent(new CustomEvent("uptilldawn-role-rules-updated"))
    }
    setBusy(false)
  }

  return <aside className="fixed right-3 top-20 z-[80] w-[min(430px,calc(100vw-1.5rem))] rounded-2xl border border-amber-400/50 bg-card shadow-2xl print:hidden">
    <div className="flex items-center justify-between gap-3 border-b p-3">
      <div>
        <p className="text-xs font-black tracking-widest text-amber-400">TESTMODUS</p>
        <p className="font-bold">{role === "staff" ? "Personeel" : "Verantwoordelijke"} · layout & rechten</p>
      </div>
      <button type="button" onClick={() => setCollapsed(value => !value)} className="rounded-lg border px-3 py-2 text-xs">
        {collapsed ? "Open editor" : "Verberg editor"}
      </button>
    </div>
    {!collapsed && <div className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
      <p className="text-xs text-muted-foreground">Sleep elementen om te herschikken. Zichtbaar en bruikbaar worden na opslaan live toegepast voor alle gebruikers van deze rol.</p>
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
      <button type="button" disabled={busy} onClick={save} className="w-full rounded-xl bg-violet-600 p-3 font-black text-white disabled:opacity-50">
        {busy ? "OPSLAAN…" : "TESTLAYOUT & ROLRECHTEN OPSLAAN"}
      </button>
      {message && <p role="status" className="rounded-lg border p-2 text-sm">{message}</p>}
    </div>}
  </aside>
}
