"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import type { Session, User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/crew-client"
import { clearOfflineIdentity } from "@/lib/crew-offline-snapshot"

export type UiRole = "employee" | "responsible_lead" | "admin"
type TestRole = UiRole | null

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
  roleMode: UiRole | null
  setRoleMode: (role: UiRole) => Promise<void>
  loading: boolean
  refreshProfile: () => Promise<void>
  testMode: boolean
  setTestMode: (active: boolean) => void
  testRole: TestRole
  setTestRole: (role: TestRole) => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  roles: [],
  isAdmin: false,
  realIsAdmin: false,
  roleMode: null,
  setRoleMode: async () => {},
  loading: true,
  refreshProfile: async () => {},
  testMode: false,
  setTestMode: () => {},
  testRole: null,
  setTestRole: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [roles, setRoles] = useState<UiRole[]>([])
  const [roleMode, setRoleModeState] = useState<UiRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [testMode, setTestModeState] = useState(false)
  const [testRole, setTestRoleState] = useState<TestRole>(null)

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,full_name,profile_photo_url,approved,role")
      .eq("id", userId)
      .single()

    const role = data?.role
    if (error || !data?.approved || (role !== "staff" && role !== "responsible_lead" && role !== "admin")) {
      setProfile(null)
      setRoles([])
      setRoleModeState(null)
      return
    }

    setProfile({
      id: data.id,
      full_name: data.full_name ?? "",
      profile_photo_url: data.profile_photo_url,
      approved: data.approved,
      role,
    })
    const baseUiRole: UiRole = role === "staff" ? "employee" : role
    setRoles([baseUiRole])
    if (role === "admin") {
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
        void clearOfflineIdentity().catch(() => {})
      }
    })
    return () => { alive = false; subscription.unsubscribe() }
  }, [pathname, loadProfile, supabase])

  const realIsAdmin = profile?.role === "admin"
  const effectiveRoles: UiRole[] = realIsAdmin && testMode && testRole
    ? [testRole]
    : realIsAdmin && roleMode
      ? [roleMode]
      : roles
  const effectiveIsAdmin = effectiveRoles.includes("admin")

  const setRoleMode = async (role: UiRole) => {
    if (!realIsAdmin || testMode) return
    const dbRole = role === "employee" ? "staff" : role
    const { data, error } = await supabase.rpc("upt_set_admin_role_mode", { p_role: dbRole })
    if (error || data !== dbRole) throw new Error("Rolmodus kon niet worden gewijzigd.")
    setRoleModeState(role)
  }

  const setTestRole = (role: TestRole) => {
    if (!realIsAdmin || !testMode) return
    const next = role || "employee"
    setTestRoleState(next)
    window.sessionStorage.setItem("uptilldawn-admin-test-role", next)
    document.cookie = `uptilldawn-admin-test-role=${next}; path=/; SameSite=Lax`
  }

  const setTestMode = (active: boolean) => {
    if (!realIsAdmin) return
    setTestModeState(active)
    if (active) {
      const role = testRole || "employee"
      setTestRoleState(role)
      window.sessionStorage.setItem("uptilldawn-admin-test-mode", "1")
      window.sessionStorage.setItem("uptilldawn-admin-test-role", role)
      document.cookie = "uptilldawn-admin-test-mode=1; path=/; SameSite=Lax"
      document.cookie = `uptilldawn-admin-test-role=${role}; path=/; SameSite=Lax`
    } else {
      setTestRoleState(null)
      window.sessionStorage.removeItem("uptilldawn-admin-test-mode")
      window.sessionStorage.removeItem("uptilldawn-admin-test-role")
      document.cookie = "uptilldawn-admin-test-mode=; path=/; Max-Age=0; SameSite=Lax"
      document.cookie = "uptilldawn-admin-test-role=; path=/; Max-Age=0; SameSite=Lax"
    }
  }

  useEffect(() => {
    if (!realIsAdmin) return
    const active = window.sessionStorage.getItem("uptilldawn-admin-test-mode") === "1"
    const saved = window.sessionStorage.getItem("uptilldawn-admin-test-role")
    const role = saved === "employee" || saved === "responsible_lead" || saved === "admin" ? saved : "employee"
    queueMicrotask(() => {
      setTestModeState(active)
      setTestRoleState(active ? role : null)
    })
  }, [realIsAdmin])

  return <AuthContext.Provider value={{
    user, session, profile, roles: effectiveRoles, isAdmin: effectiveIsAdmin, realIsAdmin: Boolean(realIsAdmin),
    roleMode, setRoleMode, loading,
    refreshProfile: async () => { if (user) await loadProfile(user.id) },
    testMode, setTestMode, testRole, setTestRole,
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
