'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-client'

export function IncidentControls({ id, status, resolved }: { id: string; status: string; resolved: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function run(kind: 'acknowledge' | 'resolve') {
    if (busy) return
    setBusy(true)
    setMessage('')
    const s = createClient()
    const result = kind === 'acknowledge'
      ? await s.rpc('upt_acknowledge_incident', { p_incident: id })
      : await s.rpc('upt_resolve_incident', { p_incident: id })
    if (result.error) setMessage('Actie kon niet worden bevestigd.')
    else {
      setMessage(kind === 'acknowledge' ? 'Incident erkend.' : 'Incident opgelost.')
      router.refresh()
    }
    setBusy(false)
  }

  if (resolved) return <p className="mt-3 text-sm text-emerald-300">Opgelost</p>

  return <div className="mt-3 space-y-2">
    <div className="flex flex-wrap gap-2">
      {status === 'open' && <button disabled={busy} className="rounded-lg border px-3 py-2 font-semibold" onClick={() => run('acknowledge')}>ERKENNEN</button>}
      <button disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white" onClick={() => run('resolve')}>OPGELOST</button>
    </div>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </div>
}
