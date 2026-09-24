"use client"

import { useAuth } from "@/lib/providers"

export function StaffAvailability({
  available,
  children,
}: {
  available: boolean
  children: React.ReactNode
}) {
  const { roles } = useAuth()
  const isStaff = roles.includes("employee")
    && !roles.includes("responsible_lead")
    && !roles.includes("admin")

  if (isStaff && !available) return null
  return <>{children}</>
}

export function StaffUnavailableMessage({
  available,
  children,
}: {
  available: boolean
  children: React.ReactNode
}) {
  const { roles } = useAuth()
  const isStaff = roles.includes("employee")
    && !roles.includes("responsible_lead")
    && !roles.includes("admin")

  if (!isStaff || available) return null
  return <>{children}</>
}
