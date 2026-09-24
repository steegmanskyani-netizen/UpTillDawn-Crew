"use client"

export type RoleRuleRole = "staff" | "responsible_lead"
export type RoleCondition =
  | "always"
  | "assigned_event"
  | "assigned_workplace_role"
  | "event_active"
  | "shift_active"
  | "never"

export type RoleUiRule = {
  role: RoleRuleRole
  feature_key: string
  label: string
  group_key: string
  visible: boolean
  enabled: boolean
  condition_key: RoleCondition
  sort_order: number
  settings?: Record<string, unknown> | null
}

export type RoleUiContext = {
  assignedEvent: boolean
  assignedWorkplaceRole: boolean
  eventActive: boolean
  shiftActive: boolean
}

export function ruleMatches(
  rule: RoleUiRule | undefined,
  context: RoleUiContext,
  previewAll = false,
) {
  if (!rule) return false
  if (previewAll) return true
  if (!rule.visible) return false
  switch (rule.condition_key) {
    case "always": return true
    case "assigned_event": return context.assignedEvent
    case "assigned_workplace_role": return context.assignedWorkplaceRole
    case "event_active": return context.eventActive
    case "shift_active": return context.shiftActive
    case "never": return false
    default: return false
  }
}

export function ruleUsable(
  rule: RoleUiRule | undefined,
  context: RoleUiContext,
  previewAll = false,
) {
  if (!rule) return false
  if (previewAll) return true
  return rule.enabled && ruleMatches(rule, context, false)
}
