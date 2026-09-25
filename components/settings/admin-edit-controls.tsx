"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { verifyAdminSettingsCode } from "@/lib/actions/auth"
import { createClient } from "@/lib/supabase/crew-client"
import { useAuth, type UiRole } from "@/lib/providers"

const roleLabel: Record<UiRole,string> = {
  admin: "Beheerder",
  employee: "Personeel",
  responsible_lead: "Verantwoordelijke",
}

export function AdminEditControls() {
  const router = useRouter()
  const {
    realIsAdmin,
    roleMode,
    setRoleMode,
    editMode,
    setEditMode,
    editRole,
    setEditRole,
  } = useAuth()
  const [unlocked,setUnlocked] = useState(false)
  const [code,setCode] = useState("")
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState("")

  if (!realIsAdmin) return null

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      const result = await verifyAdminSettingsCode(code)
      if (!result.ok) {
        setMessage(result.error || "Onjuiste code.")
        return
      }
      setUnlocked(true)
      setCode("")
    } finally {
      setBusy(false)
    }
  }

  async function changeRole(role: UiRole) {
    setMessage("")
    if (editMode) {
      setEditRole(role)
    } else {
      setBusy(true)
      try {
        await setRoleMode(role)
      } catch {
        setMessage("Rol kon niet worden gewijzigd.")
        setBusy(false)
        return
      }
      setBusy(false)
    }
    router.push(role === "admin" ? "/admin" : "/")
    router.refresh()
  }

  async function toggleEditMode() {
    const next = !editMode
    const role = editRole || roleMode || "admin"
    if (next) setEditRole(role)
    else await createClient().rpc("upt_revoke_admin_edit_unlock")
    setEditMode(next)
    router.push(next ? (role === "admin" ? "/admin" : "/") : (roleMode === "admin" ? "/admin" : "/"))
    router.refresh()
  }

  return <section className="rounded-2xl border p-4">
    <h2 className="text-lg font-black">Beheerderstoegang</h2>
    {!unlocked ? <form onSubmit={unlock} className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">Voer de beheercode in om de rolwissel en Edit mode te openen.</p>
      <label className="grid gap-1 text-sm">
        Code
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={code}
          onChange={event => setCode(event.target.value.replace(/\D/g,"").slice(0,4))}
          className="rounded-xl border bg-background px-3 py-2"
          aria-label="Beheercode"
        />
      </label>
      <button type="submit" disabled={busy || code.length !== 4} className="rounded-xl bg-violet-600 px-4 py-2 font-black text-white disabled:opacity-50">
        {busy ? "CONTROLEREN…" : "ONTGRENDELEN"}
      </button>
      {message && <p role="status" className="text-sm text-red-500">{message}</p>}
    </form> : <div className="mt-3 space-y-3">
      <label className="grid gap-1 text-sm font-bold">
        {editMode ? "Edit-rol" : "Actieve rol"}
        <select
          aria-label="Actieve rol"
          disabled={busy}
          value={(editMode ? editRole : roleMode) || "admin"}
          onChange={event => void changeRole(event.target.value as UiRole)}
          className="rounded-xl border bg-background px-3 py-2"
        >
          <option value="employee">{roleLabel.employee}</option>
          <option value="admin">{roleLabel.admin}</option>
          <option value="responsible_lead">{roleLabel.responsible_lead}</option>
        </select>
      </label>
      <button
        type="button"
        onClick={()=>void toggleEditMode()}
        className="w-full rounded-xl border border-amber-500/50 px-4 py-3 font-black"
      >
        {editMode ? "EDIT MODE DEACTIVEREN" : "EDIT MODE ACTIVEREN"}
      </button>
      <p className="text-xs text-muted-foreground">
        In Edit mode gebruikt deze rolselector de previewrol. Buiten Edit mode wijzigt hij je actieve beheerdersrol.
      </p>
      {message && <p role="status" className="text-sm text-red-500">{message}</p>}
    </div>}
  </section>
}
