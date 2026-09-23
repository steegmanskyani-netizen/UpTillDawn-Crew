'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/providers'
import { queued, queuedUploads, synchronize, type QueuedOperation, type QueuedUpload } from '@/lib/crew-queue'

export function QueueStatus() {
  const { user } = useAuth()
  const [ops, setOps] = useState<QueuedOperation[]>([])
  const [uploads, setUploads] = useState<QueuedUpload[]>([])

  useEffect(() => {
    if (!user) return
    const id = user.id
    let alive = true
    const refresh = () => {
      void Promise.all([queued(id), queuedUploads(id)]).then(([nextOps, nextUploads]) => {
        if (!alive) return
        setOps(nextOps)
        setUploads(nextUploads)
      }).catch(() => {})
    }
    const sync = () => { void synchronize(id).catch(() => {}) }
    refresh()
    sync()
    window.addEventListener('crew-queue-change', refresh)
    window.addEventListener('online', sync)
    const timer = setInterval(sync, 30000)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('crew-queue-change', refresh)
      window.removeEventListener('online', sync)
    }
  }, [user])

  const total = ops.length + uploads.length
  if (!total) return null
  const hasError = ops.some(x => x.error) || uploads.some(x => x.error)

  return <aside role="status" className="border-b border-amber-400/30 bg-amber-950 p-3 text-sm text-amber-100">
    {ops.length} actie(s) en {uploads.length} bestand(en) wachten op bevestiging.
    {hasError && <p>Synchronisatie vereist controle. Niets wordt stilzwijgend verwijderd.</p>}
    <button className="ml-3 underline" onClick={() => user && void synchronize(user.id)}>Opnieuw proberen</button>
    <Link href="/sync" className="ml-3 underline">Details / probleem oplossen</Link>
  </aside>
}
