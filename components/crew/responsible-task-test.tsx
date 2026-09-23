"use client"

import { useAuth } from "@/lib/providers"

type Workplace = { id: string; name: string; event_id: string; events: { name: string } | null }
type Person = { id: string; full_name: string | null }

export function ResponsibleTaskTest({ workplaces, people }: { workplaces: Workplace[]; people: Person[] }) {
  const { testRole } = useAuth()
  if (testRole !== "responsible_lead") return null

  return <section className="rounded-xl border border-amber-500/60 bg-amber-500/10 p-4">
    <p className="font-bold">Testmodus verantwoordelijke</p>
    <p className="mb-3 text-sm text-muted-foreground">Kies een werkplek om te zien welke medewerkers je daar taken zou kunnen toewijzen. Dit wijzigt je echte beheerdersrechten niet.</p>
    <select className="w-full rounded-lg border bg-background p-3" defaultValue="">
      <option value="" disabled>Werkplek kiezen…</option>
      {workplaces.map(w => <option key={w.id} value={w.id}>{w.events?.name} — {w.name}</option>)}
    </select>
    {!workplaces.length && <p className="mt-3 text-sm">Er zijn nog geen actieve werkplekken. Maak eerst een evenement en werkplek aan als beheerder.</p>}
    {!!workplaces.length && <p className="mt-3 text-sm">{people.length} goedgekeurde personeelsleden beschikbaar in de beheertestgegevens. De echte verantwoordelijke werkwijze blijft op databaseniveau beperkt tot de toegewezen werkplek.</p>}
  </section>
}
