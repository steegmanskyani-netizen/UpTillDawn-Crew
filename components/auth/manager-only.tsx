"use client"

import { useAuth } from "@/lib/providers"

export function ManagerOnly({ children }: { children: React.ReactNode }) {
  const { roles } = useAuth()
  if (!roles.some(role => role === "admin" || role === "responsible_lead")) return null
  return <>{children}</>
}
