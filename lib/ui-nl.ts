export function nlStatus(value: string | null | undefined) {
  if (!value) return ""
  const key = value.trim().toLowerCase().replaceAll(" ", "_")
  const labels: Record<string, string> = {
    draft: "Concept",
    active: "Actief",
    archived: "Gearchiveerd",
    pending: "In afwachting",
    approved: "Goedgekeurd",
    rejected: "Afgewezen",
    cancelled: "Geannuleerd",
    open: "Open",
    acknowledged: "Erkend",
    resolved: "Opgelost",
    not_started: "Niet gestart",
    in_progress: "Bezig",
    completed: "Voltooid",
    synced: "Gesynchroniseerd",
    failed: "Mislukt",
    conflict: "Conflict",
    incident: "Incident",
    task: "Taak",
    message: "Bericht",
    check_ins: "Inklokken",
    check_outs: "Uitklokken",
    briefing: "Instructie",
    info: "Informatie",
  }
  return labels[key] || value
}

export function nlRole(value: string | null | undefined) {
  if (!value) return ""
  return {
    staff: "Personeel",
    employee: "Personeel",
    responsible: "Verantwoordelijke",
    responsible_lead: "Verantwoordelijke",
    admin: "Beheerder",
  }[value] || value
}
