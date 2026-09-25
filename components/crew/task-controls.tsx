'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { enqueue } from '@/lib/crew-queue'
import { createClient } from '@/lib/supabase/crew-client'

const statuses = [
  { value: 'NOT STARTED', label: 'NIET GESTART' },
  { value: 'IN PROGRESS', label: 'BEZIG' },
  { value: 'COMPLETED', label: 'VOLTOOID' },
]

export function TaskControls({
  id,
  userId,
  confirmed,
}: {
  id: string
  userId: string
  confirmed: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const s = useMemo(() => createClient(), [])

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError('')
    const { error } = await s.rpc('upt_confirm_task_assignment', { p_assignment: id })
    if (error) setError('Bevestiging kon niet worden opgeslagen.')
    else router.refresh()
    setBusy(false)
  }

  if (!confirmed) {
    return <div className="mt-3 space-y-2">
      <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm font-semibold">
        Wacht op bevestiging
      </p>
      <button
        disabled={busy}
        className="rounded-lg bg-violet-600 p-3 font-bold text-white disabled:opacity-50"
        onClick={confirm}
      >
        TAAK BEVESTIGEN
      </button>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  }

  return <div className="mt-3 flex flex-wrap gap-2">
    {statuses.map(status => <button
      key={status.value}
      disabled={busy}
      className="rounded-lg border p-3"
      onClick={async () => {
        setBusy(true)
        setError('')
        try {
          await enqueue(userId, 'task', { assignment_id: id, status: status.value })
          router.refresh()
        } catch {
          setError('Wijziging kon niet worden bewaard.')
        } finally {
          setBusy(false)
        }
      }}
    >
      {status.label}
    </button>)}
    {error && <p role="alert" className="w-full text-sm text-red-400">{error}</p>}
  </div>
}
