"use client"

import { useMemo, useState } from "react"

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
  requirePerson = true,
  workplaceRequired = false,
}: {
  events: AssignmentEvent[]
  workplaces: AssignmentWorkplace[]
  people: AssignmentPerson[]
  memberships: AssignmentMembership[]
  isAdmin: boolean
  requirePerson?: boolean
  workplaceRequired?: boolean
}) {
  const [eventId, setEventId] = useState("")
  const [workplaceId, setWorkplaceId] = useState("")
  const [personId, setPersonId] = useState("")

  const visibleWorkplaces = useMemo(
    () => isAdmin && eventId
      ? workplaces.filter(workplace => workplace.event_id === eventId)
      : workplaces,
    [eventId, isAdmin, workplaces],
  )

  const effectiveEventId = workplaceId
    ? workplaces.find(workplace => workplace.id === workplaceId)?.event_id || eventId
    : eventId

  const allowedUserIds = useMemo(() => {
    if (workplaceId) {
      return new Set(
        memberships
          .filter(member => member.workplace_id === workplaceId)
          .map(member => member.user_id),
      )
    }
    if (effectiveEventId) {
      return new Set(
        memberships
          .filter(member => member.event_id === effectiveEventId)
          .map(member => member.user_id),
      )
    }
    return new Set<string>()
  }, [effectiveEventId, memberships, workplaceId])

  const visiblePeople = people.filter(person => allowedUserIds.has(person.id))

  return <>
    {isAdmin && <select
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
      {isAdmin
        ? <option value="">Geheel evenement</option>
        : <option value="">Werkplek…</option>}
      {visibleWorkplaces.map(workplace => {
        const eventName = events.find(event => event.id === workplace.event_id)?.name
        return <option key={workplace.id} value={workplace.id}>
          {eventName ? `${eventName} — ` : ""}{workplace.name}
        </option>
      })}
    </select>

    {requirePerson && <select
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
    </select>}
  </>
}
