"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import type { Session, User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/crew-client"
import { clearOfflineIdentity } from "@/lib/crew-offline-snapshot"

type UiRole = "employee" | "responsible_lead" | "admin"

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
  loading: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  roles: [],
  isAdmin: false,
  loading: true,
  refreshProfile: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [roles, setRoles] = useState<UiRole[]>([])
  const [loading, setLoading] = useState(true)

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
      return
    }

    setProfile({
      id: data.id,
      full_name: data.full_name ?? "",
      profile_photo_url: data.profile_photo_url,
      approved: data.approved,
      role,
    })
    setRoles([role === "staff" ? "employee" : role])
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

  return <AuthContext.Provider value={{
    user,
    session,
    profile,
    roles,
    isAdmin: roles.includes("admin"),
    loading,
    refreshProfile: async () => { if (user) await loadProfile(user.id) },
  }}>
    {children}
  </AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

export function useDisplayName(): string {
  const { profile, user } = useAuth()
  if (profile?.full_name) return profile.full_name
  if (user?.email) return user.email.split("@")[0]
  return "Crew"
}
