"use client"

import { useAuth } from "@/lib/providers"

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { roles, isAdmin } = useAuth()
  if (!isAdmin || !roles.includes("admin")) return null
  return <>{children}</>
}
