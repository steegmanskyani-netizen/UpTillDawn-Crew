"use client"

import { useEffect, useMemo, useState } from "react"

export type AssignmentEvent = { id: string; name: string }
export type AssignmentWorkplace = { id: string; name: string; event_id: string }
export type AssignmentPerson = { id: string; full_name: string | null }
export type AssignmentMembership = { event_id: string; workplace_id: string | null; user_id: string }

export function AssignmentScopeFields({
  events,
  workplaces,
  people,
  memberships,
  isAdmin,
  showEventSelect = isAdmin,
  requirePerson = true,
  workplaceRequired = false,
  multiplePeople = false,
  availability = [],
  defaultEventId = "",
}: {
  events: AssignmentEvent[]
  workplaces: AssignmentWorkplace[]
  people: AssignmentPerson[]
  memberships: AssignmentMembership[]
  isAdmin: boolean
  showEventSelect?: boolean
  requirePerson?: boolean
  workplaceRequired?: boolean
  multiplePeople?: boolean
  availability?: Array<{ event_id: string; user_id: string }>
  defaultEventId?: string
}) {
  const validDefaultEventId = events.some(event => event.id === defaultEventId) ? defaultEventId : ""
  const [eventId, setEventId] = useState(validDefaultEventId)
  const [workplaceId, setWorkplaceId] = useState("")
  const [personId, setPersonId] = useState("")

  useEffect(() => {
    if (!defaultEventId || !events.some(event => event.id === defaultEventId)) return
    setEventId(defaultEventId)
    setWorkplaceId("")
    setPersonId("")
  }, [defaultEventId, events])

  const visibleWorkplaces = useMemo(
    () => showEventSelect && eventId
      ? workplaces.filter(workplace => workplace.event_id === eventId)
      : workplaces,
    [eventId, showEventSelect, workplaces],
  )

  const effectiveEventId = workplaceId
    ? workplaces.find(workplace => workplace.id === workplaceId)?.event_id || eventId
    : eventId

  const allowedUserIds = useMemo(() => {
    if (!effectiveEventId) return new Set<string>()

    const base = new Set(
      memberships
        .filter(member =>
          member.event_id === effectiveEventId
          && (
            !workplaceId
            || member.workplace_id === null
            || member.workplace_id === workplaceId
          )
        )
        .map(member => member.user_id),
    )

    if (!availability.length) return base

    const can = new Set(
      availability
        .filter(item => item.event_id === effectiveEventId)
        .map(item => item.user_id),
    )

    return new Set([...base].filter(userId => can.has(userId)))
  }, [availability, effectiveEventId, memberships, workplaceId])

  const visiblePeople = people.filter(person => allowedUserIds.has(person.id))

  return <>
    {showEventSelect && <select
      name="event_id"
      required={!workplaceId}
      value={eventId}
      onChange={event => {
        setEventId(event.target.value)
        setWorkplaceId("")
        setPersonId("")
      }}
      className="border bg-background p-3"
    >
      <option value="">Evenement…</option>
      {events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
    </select>}

    <select
      name="workplace_id"
      required={workplaceRequired}
      value={workplaceId}
      onChange={event => {
        setWorkplaceId(event.target.value)
        setPersonId("")
      }}
      className="border bg-background p-3"
    >
      {showEventSelect
        ? <option value="">{workplaceRequired?'Werkplek…':'Geheel evenement'}</option>
        : <option value="">Werkplek…</option>}
      {visibleWorkplaces.map(workplace => {
        const eventName = events.find(event => event.id === workplace.event_id)?.name
        return <option key={workplace.id} value={workplace.id}>
          {eventName ? `${eventName} — ` : ""}{workplace.name}
        </option>
      })}
    </select>

    {requirePerson && (multiplePeople
      ? <fieldset className="grid gap-2 rounded-xl border p-3">
          <legend className="px-1 text-sm font-semibold">Medewerkers</legend>
          {!effectiveEventId
            ? <p className="text-sm text-muted-foreground">Kies eerst een evenement.</p>
            : !visiblePeople.length
              ? <p className="text-sm text-muted-foreground">Geen toegevoegde medewerkers die hebben aangeduid dat ze kunnen.</p>
              : <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                  {visiblePeople.map(person => <label key={person.id} className="flex items-center gap-2 rounded-lg border p-3">
                    <input type="checkbox" name="user_id" value={person.id}/>
                    <span>{person.full_name || "Naam ontbreekt"}</span>
                  </label>)}
                </div>}
        </fieldset>
      : <select
          name="user_id"
          required
          disabled={!effectiveEventId && !workplaceId}
          className="border bg-background p-3 disabled:opacity-50"
          value={personId}
          onChange={event => setPersonId(event.target.value)}
        >
          <option value="">Medewerker…</option>
          {visiblePeople.map(person =>
            <option key={person.id} value={person.id}>{person.full_name || "Naam ontbreekt"}</option>,
          )}
        </select>)}
  </>
}
