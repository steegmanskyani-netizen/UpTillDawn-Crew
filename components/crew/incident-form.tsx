'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-client'
import { enqueue } from '@/lib/crew-queue'

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
    let uploadedPath: string | null = null

    try {
      let location: { latitude: number; longitude: number; accuracy: number } | null = null
      if (navigator.geolocation && navigator.onLine) {
        location = await new Promise(resolve => navigator.geolocation.getCurrentPosition(
          p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
          () => resolve(null),
          { timeout: 6000, maximumAge: 0, enableHighAccuracy: true },
        ))
      }

      if (file) {
        if (!navigator.onLine) {
          await enqueue(userId, 'incident', {
            event_id: eventId,
            ...(workplaceId ? { workplace_id: workplaceId } : {}),
            message,
          })
          setStatus('URGENT melding is offline bewaard ZONDER foto. De foto is niet verloren zonder melding: verstuur ze opnieuw zodra je online bent.')
          return
        }

        if (file.size > 10 * 1024 * 1024) throw new Error('De incidentfoto mag maximaal 10 MB zijn.')
        const extByType: Record<string, string> = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
        const ext = extByType[file.type]
        if (!ext) throw new Error('Gebruik een JPG-, PNG- of WEBP-foto.')

        const s = createClient()
        uploadedPath = `${userId}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await s.storage.from('incident-photos').upload(uploadedPath, file, {
          contentType: file.type,
          upsert: false,
        })
        if (uploadError) throw new Error('Incidentfoto uploaden mislukt.')

        const { error } = await s.rpc('upt_create_incident', {
          p_event: eventId,
          p_workplace: (workplaceId || null) as unknown as string,
          p_message: message,
          p_photo_path: uploadedPath,
          ...(location ? {
            p_latitude: location.latitude,
            p_longitude: location.longitude,
            p_accuracy_m: location.accuracy,
          } : {}),
        })
        if (error) throw new Error('URGENT melding kon niet worden bevestigd.')

        setFile(null)
        setFileKey(k => k + 1)
        setStatus('URGENT melding met foto is door de server bevestigd.')
        router.refresh()
        return
      }

      await enqueue(userId, 'incident', {
        event_id: eventId,
        ...(workplaceId ? { workplace_id: workplaceId } : {}),
        message,
        ...(location || {}),
      })
      setStatus('Melding bewaard. Wacht op serverbevestiging in het meldingenoverzicht.')
      router.refresh()
    } catch (error) {
      if (uploadedPath) {
        const s = createClient()
        await s.storage.from('incident-photos').remove([uploadedPath])
      }
      setStatus(error instanceof Error ? error.message : 'Melding kon niet worden bewaard. Probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }}>
    <h2 className="text-xl font-black text-red-400">URGENT MELDEN</h2>
    <select name="event" required defaultValue={defaultEventId || ''} className="w-full rounded-lg border bg-background p-3">
      <option value="">Selecteer event</option>
      {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
    <select name="workplace" defaultValue={defaultWorkplaceId || ''} className="w-full rounded-lg border bg-background p-3">
      <option value="">Geen specifieke werkplek</option>
      {contexts.map(c => <option key={`${c.event_id}:${c.workplace_id}`} value={c.workplace_id}>{c.event_name} — {c.workplace_name}</option>)}
    </select>
    <textarea name="message" required maxLength={4000} placeholder="Wat is er aan de hand?" className="min-h-28 w-full rounded-lg border bg-background p-3"/>
    <label className="block text-sm">Optionele foto
      <input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} className="mt-1 block w-full rounded-lg border bg-background p-3"/>
    </label>
    <button disabled={busy} className="w-full rounded-xl bg-red-600 p-4 font-black text-white">{busy ? 'BEWAREN…' : 'URGENT VERSTUREN'}</button>
    {status && <p role="status">{status}</p>}
  </form>
}
