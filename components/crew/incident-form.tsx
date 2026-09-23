'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { enqueue, enqueueIncidentPhoto } from '@/lib/crew-queue'

type EventOption = { id: string; name: string }
type WorkplaceContext = {
  event_id: string
  workplace_id: string
  event_name: string
  workplace_name: string
}

export function IncidentForm({
  userId,
  events,
  contexts,
  defaultEventId,
  defaultWorkplaceId,
}: {
  userId: string
  events: EventOption[]
  contexts: WorkplaceContext[]
  defaultEventId?: string
  defaultWorkplaceId?: string
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [eventId, setEventId] = useState(defaultEventId || '')
  const [workplaceId, setWorkplaceId] = useState(defaultWorkplaceId || '')
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const router = useRouter()

  return <form className="space-y-3 rounded-2xl border border-red-500 p-5" onSubmit={async e => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setStatus('')
    const fd = new FormData(e.currentTarget)
    const eventId = String(fd.get('event') || '')
    const workplaceId = String(fd.get('workplace') || '')
    const message = String(fd.get('message') || '').trim()
    try {
      let location: { latitude: number; longitude: number; accuracy: number } | null = null
      if (navigator.geolocation && navigator.onLine) {
        location = await new Promise(resolve => navigator.geolocation.getCurrentPosition(
          p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
          () => resolve(null),
          { timeout: 6000, maximumAge: 0, enableHighAccuracy: true },
        ))
      }

      const payload = {
        event_id: eventId,
        ...(workplaceId ? { workplace_id: workplaceId } : {}),
        message,
        ...(location || {}),
      }

      if (file) {
        await enqueueIncidentPhoto(userId, payload, file)
        setFile(null)
        setFileKey(k => k + 1)
        setStatus(navigator.onLine
          ? 'URGENT melding en foto zijn bewaard voor serververwerking.'
          : 'URGENT melding en foto zijn lokaal bewaard en worden automatisch verzonden zodra je online bent.')
      } else {
        await enqueue(userId, 'incident', payload)
        setStatus('Melding bewaard. Alleen serverbevestigde incidenten gelden als gesynchroniseerd.')
      }
      router.refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Melding kon niet worden bewaard. Probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }}>
    <h2 className="text-xl font-black text-red-400">URGENT MELDEN</h2>
    <select
      name="event"
      required
      value={eventId}
      onChange={e => {
        const nextEvent = e.target.value
        setEventId(nextEvent)
        if (!contexts.some(context => context.event_id === nextEvent && context.workplace_id === workplaceId)) {
          setWorkplaceId('')
        }
      }}
      className="w-full rounded-lg border bg-background p-3"
    >
      <option value="">Selecteer evenement</option>
      {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
    <select
      name="workplace"
      value={workplaceId}
      onChange={e => setWorkplaceId(e.target.value)}
      className="w-full rounded-lg border bg-background p-3"
    >
      <option value="">Geen specifieke werkplek</option>
      {contexts.filter(context => !eventId || context.event_id === eventId).map(context =>
        <option key={`${context.event_id}:${context.workplace_id}`} value={context.workplace_id}>{context.workplace_name}</option>
      )}
    </select>
    <textarea name="message" required maxLength={4000} placeholder="Wat is er aan de hand?" className="min-h-28 w-full rounded-lg border bg-background p-3"/>
    <label className="block text-sm">Optionele foto
      <input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} className="mt-1 block w-full rounded-lg border bg-background p-3"/>
    </label>
    <button disabled={busy} className="w-full rounded-xl bg-red-600 p-4 font-black text-white">{busy ? 'BEWAREN…' : 'URGENT VERSTUREN'}</button>
    {status && <p role="status">{status}</p>}
  </form>
}
