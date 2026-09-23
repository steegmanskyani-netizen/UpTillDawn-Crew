'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/providers'
import { discardQueuedOperation, queued, synchronize, type QueuedOperation } from '@/lib/crew-queue'

const labels: Record<string,string> = {
  start_work: 'START WORK',
  start_break: 'START BREAK',
  stop_break: 'STOP BREAK',
  stop_work: 'STOP WORK',
  transition: 'WERKPLEKOVERGANG',
  task: 'TAAKSTATUS',
  message: 'CHATBERICHT',
  incident: 'URGENT MELDING',
}

export function SyncCenter() {
  const { user } = useAuth()
  const [ops, setOps] = useState<QueuedOperation[]>([])
  const [online, setOnline] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function refresh() {
    if (!user) return
    setOps(await queued(user.id))
  }

  useEffect(() => {
    setOnline(navigator.onLine)
    if (!user) return
    let alive = true
    const update = () => { if (alive) void queued(user.id).then(setOps).catch(() => {}) }
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
  }, [user])

  if (!user) return null

  async function retry() {
    setBusy(true)
    setMessage('')
    try {
      await synchronize(user!.id)
      await refresh()
      setMessage('Synchronisatie opnieuw uitgevoerd. Alleen serverbevestigde acties zijn verwijderd uit de wachtrij.')
    } catch {
      setMessage('Synchronisatie werd onderbroken. De acties blijven lokaal bewaard.')
    } finally {
      setBusy(false)
    }
  }

  async function discard(op:QueuedOperation) {
    const ok = window.confirm(`Deze ${labels[op.type] || op.type}-actie is NIET door de server bevestigd. Definitief uit de lokale wachtrij verwijderen?`)
    if (!ok) return
    await discardQueuedOperation(user!.id, op.id)
    await refresh()
    setMessage('Actie expliciet verwijderd uit de lokale wachtrij.')
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <div>
        <p className="font-bold">{online ? 'ONLINE' : 'OFFLINE'}</p>
        <p className="text-sm text-muted-foreground">{ops.length} lokale actie(s) wachten op serverbevestiging.</p>
      </div>
      <button disabled={busy || !online || !ops.length} onClick={retry} className="rounded-xl bg-violet-600 px-4 py-3 font-bold">OPNIEUW SYNCHRONISEREN</button>
    </div>

    {!ops.length && <p className="rounded-xl border p-4">Geen openstaande synchronisatieacties.</p>}
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
      <button onClick={() => discard(op)} className="mt-3 rounded-lg border border-red-500/50 px-3 py-2 text-sm text-red-300">Definitief uit wachtrij verwijderen</button>
    </article>)}

    {message && <p role="status" className="rounded-xl border p-4">{message}</p>}
    <p className="text-xs text-muted-foreground">Een foutieve tijdactie kan latere tijdacties blokkeren om de volgorde te beschermen. Onafhankelijke chat- en URGENT-acties blijven apart synchroniseren.</p>
  </div>
}
