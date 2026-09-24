"use client"

import { useAuth } from "@/lib/providers"

export function AssignedEventOnly({
  available,
  children,
}: {
  available: boolean
  children: React.ReactNode
}) {
  const { roles } = useAuth()
  if (roles.includes("admin")) return <>{children}</>
  if (!available) return null
  return <>{children}</>
}
