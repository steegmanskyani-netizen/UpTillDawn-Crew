"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import type { Session, User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/crew-client"
import { clearOfflineIdentity } from "@/lib/crew-offline-snapshot"

export type UiRole = "employee" | "responsible_lead" | "admin"
type EditRole = UiRole | null

interface UserProfile {
  id: string
  full_name: string
  profile_photo_url: string | null
  approved: boolean
  role: "staff" | "responsible_lead" | "admin"
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  roles: UiRole[]
  isAdmin: boolean
  realIsAdmin: boolean
  isOwner: boolean
  roleMode: UiRole | null
  setRoleMode: (role: UiRole) => Promise<void>
  loading: boolean
  refreshProfile: () => Promise<void>
  editMode: boolean
  setEditMode: (active: boolean) => void
  editRole: EditRole
  setEditRole: (role: EditRole) => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  roles: [],
  isAdmin: false,
  realIsAdmin: false,
  isOwner: false,
  roleMode: null,
  setRoleMode: async () => {},
  loading: true,
  refreshProfile: async () => {},
  editMode: false,
  setEditMode: () => {},
  editRole: null,
  setEditRole: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [roles, setRoles] = useState<UiRole[]>([])
  const [roleMode, setRoleModeState] = useState<UiRole | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditModeState] = useState(false)
  const [editRole, setEditRoleState] = useState<EditRole>(null)

  const loadProfile = useCallback(async (userId: string) => {
    const [{ data, error }, { data: ownerFlag }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,full_name,profile_photo_url,approved,role")
        .eq("id", userId)
        .single(),
      supabase.rpc("upt_current_is_owner"),
    ])

    const role = data?.role
    const owner = ownerFlag === true
    if (
      error ||
      !data ||
      (!data.approved && !owner) ||
      (role !== "staff" && role !== "responsible_lead" && role !== "admin")
    ) {
      setProfile(null)
      setRoles([])
      setRoleModeState(null)
      setIsOwner(false)
      return
    }

    setIsOwner(owner)
    setProfile({
      id: data.id,
      full_name: data.full_name ?? "",
      profile_photo_url: data.profile_photo_url,
      approved: data.approved || owner,
      role,
    })

    const baseUiRole: UiRole = role === "staff" ? "employee" : role
    const hasPermanentAdminAccess = role === "admin" || owner
    setRoles([baseUiRole])

    if (hasPermanentAdminAccess) {
      const { data: effectiveRole, error: roleError } = await supabase.rpc("upt_current_effective_role")
      const nextMode: UiRole = !roleError && effectiveRole === "responsible_lead"
        ? "responsible_lead"
        : !roleError && effectiveRole === "staff"
          ? "employee"
          : "admin"
      setRoleModeState(nextMode)
    } else {
      setRoleModeState(baseUiRole)
    }
  }, [supabase])

  useEffect(() => {
    let alive = true
    const refreshAuth = async () => {
      const [{ data: { user: currentUser } }, { data: { session: currentSession } }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ])
      if (!alive) return
      setUser(currentUser)
      setSession(currentSession)
      if (currentUser) await loadProfile(currentUser.id)
      else {
        setProfile(null)
        setRoles([])
        setRoleModeState(null)
        setIsOwner(false)
        await clearOfflineIdentity().catch(() => {})
      }
      if (alive) setLoading(false)
    }
    void refreshAuth()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      if (currentSession?.user) setTimeout(() => void loadProfile(currentSession.user.id), 0)
      else {
        setProfile(null)
        setRoles([])
        setRoleModeState(null)
        setIsOwner(false)
        void clearOfflineIdentity().catch(() => {})
      }
    })
    return () => { alive = false; subscription.unsubscribe() }
  }, [pathname, loadProfile, supabase])

  const realIsAdmin = profile?.role === "admin" || isOwner
  const effectiveRoles: UiRole[] = realIsAdmin && editMode && editRole
    ? [editRole]
    : realIsAdmin && roleMode
      ? [roleMode]
      : roles
  const effectiveIsAdmin = effectiveRoles.includes("admin")

  const setRoleMode = async (role: UiRole) => {
    if (!realIsAdmin || editMode) return
    const dbRole = role === "employee" ? "staff" : role
    const { data, error } = await supabase.rpc("upt_set_admin_role_mode", { p_role: dbRole })
    if (error || data !== dbRole) throw new Error("Rolmodus kon niet worden gewijzigd.")
    setRoleModeState(role)
  }

  const setEditRole = (role: EditRole) => {
    if (!realIsAdmin || !editMode) return
    const next = role || "employee"
    setEditRoleState(next)
    window.sessionStorage.setItem("uptilldawn-admin-edit-role", next)
    document.cookie = `uptilldawn-admin-edit-role=${next}; path=/; SameSite=Lax`
  }

  const setEditMode = (active: boolean) => {
    if (!realIsAdmin) return
    setEditModeState(active)
    if (active) {
      const role = editRole || roleMode || "employee"
      setEditRoleState(role)
      window.sessionStorage.setItem("uptilldawn-admin-edit-mode", "1")
      window.sessionStorage.setItem("uptilldawn-admin-edit-role", role)
      document.cookie = "uptilldawn-admin-edit-mode=1; path=/; SameSite=Lax"
      document.cookie = `uptilldawn-admin-edit-role=${role}; path=/; SameSite=Lax`
    } else {
      setEditRoleState(null)
      window.sessionStorage.removeItem("uptilldawn-admin-edit-mode")
      window.sessionStorage.removeItem("uptilldawn-admin-edit-role")
      document.cookie = "uptilldawn-admin-edit-mode=; path=/; Max-Age=0; SameSite=Lax"
      document.cookie = "uptilldawn-admin-edit-role=; path=/; Max-Age=0; SameSite=Lax"
    }
  }

  useEffect(() => {
    if (!realIsAdmin) return
    window.sessionStorage.removeItem("uptilldawn-admin-test-mode")
    window.sessionStorage.removeItem("uptilldawn-admin-test-role")
    document.cookie = "uptilldawn-admin-test-mode=; path=/; Max-Age=0; SameSite=Lax"
    document.cookie = "uptilldawn-admin-test-role=; path=/; Max-Age=0; SameSite=Lax"
    const active = window.sessionStorage.getItem("uptilldawn-admin-edit-mode") === "1"
    const saved = window.sessionStorage.getItem("uptilldawn-admin-edit-role")
    const role = saved === "employee" || saved === "responsible_lead" || saved === "admin" ? saved : "employee"
    queueMicrotask(() => {
      setEditModeState(active)
      setEditRoleState(active ? role : null)
    })
  }, [realIsAdmin])

  return <AuthContext.Provider value={{
    user, session, profile, roles: effectiveRoles, isAdmin: effectiveIsAdmin, realIsAdmin: Boolean(realIsAdmin), isOwner,
    roleMode, setRoleMode, loading,
    refreshProfile: async () => { if (user) await loadProfile(user.id) },
    editMode, setEditMode, editRole, setEditRole,
  }}>
    {children}
  </AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }

export function useDisplayName(): string {
  const { profile, user } = useAuth()
  if (profile?.full_name) return profile.full_name
  if (user?.email) return user.email.split("@")[0]
  return "Personeel"
}
