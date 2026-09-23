'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/providers'
import {
  discardQueuedOperation,
  discardQueuedUpload,
  queued,
  queuedUploads,
  synchronize,
  type QueuedOperation,
  type QueuedUpload,
} from '@/lib/crew-queue'

const labels: Record<string,string> = {
  start_work: 'WERK STARTEN',
  start_break: 'PAUZE STARTEN',
  stop_break: 'PAUZE STOPPEN',
  stop_work: 'WERK STOPPEN',
  transition: 'WERKPLEKOVERGANG',
  task: 'TAAKSTATUS',
  message: 'CHATBERICHT',
  incident: 'URGENT MELDING',
  incident_photo: 'URGENT FOTO',
  chat_photo: 'CHATFOTO',
}

export function SyncCenter() {
  const { user } = useAuth()
  const userId = user?.id
  const [ops, setOps] = useState<QueuedOperation[]>([])
  const [uploads, setUploads] = useState<QueuedUpload[]>([])
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function refresh() {
    if (!userId) return
    const [nextOps, nextUploads] = await Promise.all([queued(userId), queuedUploads(userId)])
    setOps(nextOps)
    setUploads(nextUploads)
  }

  useEffect(() => {
    if (!userId) return
    let alive = true
    const update = () => {
      void Promise.all([queued(userId), queuedUploads(userId)]).then(([nextOps, nextUploads]) => {
        if (!alive) return
        setOps(nextOps)
        setUploads(nextUploads)
      }).catch(() => {})
    }
    const network = () => { setOnline(navigator.onLine); update() }
    update()
    window.addEventListener('crew-queue-change', update)
    window.addEventListener('online', network)
    window.addEventListener('offline', network)
    return () => {
      alive = false
      window.removeEventListener('crew-queue-change', update)
      window.removeEventListener('online', network)
      window.removeEventListener('offline', network)
    }
  }, [userId])

  if (!userId) return null
  const authenticatedUserId: string = userId

  const total = ops.length + uploads.length

  async function retry() {
    setBusy(true)
    setMessage('')
    try {
      await synchronize(authenticatedUserId)
      await refresh()
      setMessage('Synchronisatie opnieuw uitgevoerd. Alleen serverbevestigde acties zijn verwijderd uit de wachtrij.')
    } catch {
      setMessage('Synchronisatie werd onderbroken. Acties en bestanden blijven lokaal bewaard.')
    } finally {
      setBusy(false)
    }
  }

  async function discardOperation(op: QueuedOperation) {
    const ok = window.confirm(`Deze ${labels[op.type] || op.type}-actie is NIET door de server bevestigd. Definitief verwijderen?`)
    if (!ok) return
    await discardQueuedOperation(authenticatedUserId, op.id)
    await refresh()
    setMessage('Actie expliciet verwijderd uit de lokale wachtrij.')
  }

  async function discardUpload(upload: QueuedUpload) {
    const ok = window.confirm('Dit bestand is mogelijk nog NIET door de server verwerkt. Definitief lokaal verwijderen?')
    if (!ok) return
    await discardQueuedUpload(authenticatedUserId, upload.id)
    await refresh()
    setMessage('Bestand expliciet verwijderd uit de lokale wachtrij.')
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <div>
        <p className="font-bold">{online ? 'VERBONDEN' : 'NIET VERBONDEN'}</p>
        <p className="text-sm text-muted-foreground">{ops.length} actie(s) + {uploads.length} bestand(en) wachten op serverbevestiging.</p>
      </div>
      <button disabled={busy || !online || !total} onClick={retry} className="rounded-xl bg-violet-600 px-4 py-3 font-bold">OPNIEUW SYNCHRONISEREN</button>
    </div>

    {!total && <p className="rounded-xl border p-4">Geen openstaande synchronisatieacties of bestanden.</p>}

    {ops.map(op => <article key={op.id} className={`rounded-xl border p-4 ${op.error ? 'border-amber-500' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">{labels[op.type] || op.type}</h2>
          <p className="text-sm text-muted-foreground">Lokaal bewaard: {new Date(op.createdAt).toLocaleString('nl-BE')} · pogingen: {op.attempts}</p>
        </div>
        <span className="rounded-full border px-2 py-1 text-xs font-bold">{op.error ? 'CONTROLE NODIG' : 'WACHTEND'}</span>
      </div>
      {op.error && <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm">{op.error}</p>}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm underline">Technische actiedetails</summary>
        <pre className="mt-2 max-h-52 overflow-auto rounded-lg border p-3 text-xs">{JSON.stringify(op.payload, null, 2)}</pre>
      </details>
      <button onClick={() => discardOperation(op)} className="mt-3 rounded-lg border border-red-500/50 px-3 py-2 text-sm text-red-300">Definitief uit wachtrij verwijderen</button>
    </article>)}

    {uploads.map(upload => <article key={upload.id} className={`rounded-xl border p-4 ${upload.error ? 'border-amber-500' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">{labels[upload.kind]}</h2>
          <p className="text-sm text-muted-foreground">{(upload.blob.size / 1024 / 1024).toFixed(1)} MB · lokaal bewaard {new Date(upload.createdAt).toLocaleString('nl-BE')} · pogingen: {upload.attempts}</p>
        </div>
        <span className="rounded-full border px-2 py-1 text-xs font-bold">{upload.error ? 'CONTROLE NODIG' : 'WACHTEND'}</span>
      </div>
      {upload.error && <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm">{upload.error}</p>}
      <button onClick={() => discardUpload(upload)} className="mt-3 rounded-lg border border-red-500/50 px-3 py-2 text-sm text-red-300">Bestand definitief verwijderen</button>
    </article>)}

    {message && <p role="status" className="rounded-xl border p-4">{message}</p>}
    <p className="text-xs text-muted-foreground">Tijdacties blijven geordend. URGENT- en chatfoto&apos;s blijven als Blob in IndexedDB bewaard tot upload en serverbewerking bevestigd zijn.</p>
  </div>
}
