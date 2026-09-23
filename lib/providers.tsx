"use client"

// ============================================================
// Real Supabase Auth Provider
// Replaces the old mock AuthProvider and RoleProvider.
// Wraps the app and exposes session + user profile + roles.
// ============================================================

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/crew-client"
import { clearOfflineIdentity } from "@/lib/crew-offline-snapshot"
import type { User, Session } from "@supabase/supabase-js"

type UserRole = "employee" | "responsible_lead" | "admin" | "director" | "accounts" | "reception"

interface UserProfile {
  id: string
  email: string
  full_name: string
  display_name: string | null
  job_title: string | null
  department_id: string | null
  location_id: string | null
  desk_extension: string | null
  avatar_url: string | null
  is_active: boolean
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  roles: UserRole[]
  isAdmin: boolean
  isDirector: boolean
  isAccounts: boolean
  isReception: boolean
  loading: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  roles: [],
  isAdmin: false,
  isDirector: false,
  isAccounts: false,
  isReception: false,
  loading: true,
  refreshProfile: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [roles, setRoles] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('profiles')
      .select('id,full_name,phone_number,profile_photo_url,approved,role').eq('id',userId).single()
    if (error || !data?.approved) { setProfile(null); setRoles([]); return }
    setProfile({ id:data.id, email:'', full_name:data.full_name ?? '',
      display_name:null, job_title:null, department_id:null, location_id:null,
      desk_extension:null, avatar_url:data.profile_photo_url, is_active:data.approved })
    setRoles([data.role === 'staff' ? 'employee' : data.role] as UserRole[])
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
      if (currentUser) {
        await loadProfile(currentUser.id)
      } else {
        setProfile(null)
        setRoles([])
        await clearOfflineIdentity().catch(() => {})
      }
      if (alive) setLoading(false)
    }

    void refreshAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      if (currentSession?.user) {
        setTimeout(() => void loadProfile(currentSession.user.id), 0)
      } else {
        setProfile(null)
        setRoles([])
        void clearOfflineIdentity().catch(() => {})
      }
    })

    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [pathname, loadProfile, supabase])

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      roles,
      isAdmin: roles.includes("admin"),
      isDirector: roles.includes("director"),
      isAccounts: roles.includes("accounts"),
      isReception: roles.includes("reception"),
      loading,
      refreshProfile: async () => { if (user) await loadProfile(user.id) },
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

// ── Convenience hook ──────────────────────────────────────────
// Returns display name: prefer display_name, fallback to full_name, fallback to email prefix
export function useDisplayName(): string {
  const { profile, user } = useAuth()
  if (profile?.display_name) return profile.display_name
  if (profile?.full_name) return profile.full_name
  if (user?.email) return user.email.split("@")[0]
  return "User"
}
