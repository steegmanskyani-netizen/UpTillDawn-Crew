'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-client'

export function TimeCorrectionForm({ targetType, targetId, startedAt, endedAt }: {
  targetType: 'work_session' | 'break_session'
  targetId: string
  startedAt: string
  endedAt: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(formData: FormData) {
    if (busy) return
    setBusy(true)
    setMessage('')
    const field = String(formData.get('field'))
    const raw = String(formData.get('value'))
    const reason = String(formData.get('reason') || '').trim()
    const value = new Date(raw)
    if (!raw || Number.isNaN(value.getTime()) || !reason) {
      setMessage('Vul een geldige tijd en reden in.')
      setBusy(false)
      return
    }
    const s = createClient()
    const { error } = await s.rpc('upt_admin_correct_time', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_field_name: field,
      p_corrected_value: value.toISOString(),
      p_reason: reason,
    })
    if (error) setMessage('Correctie geweigerd. Controleer de tijd en probeer opnieuw.')
    else {
      setMessage('Tijdcorrectie opgeslagen en geaudit.')
      router.refresh()
    }
    setBusy(false)
  }

  return <form action={submit} className="mt-3 grid gap-2 rounded-xl border p-3 md:grid-cols-[auto_1fr_2fr_auto]">
    <select name="field" className="rounded-lg border bg-background p-2">
      <option value="started_at">Starttijd</option>
      {endedAt && <option value="ended_at">Eindtijd</option>}
    </select>
    <input name="value" type="datetime-local" required className="rounded-lg border bg-background p-2"/>
    <input name="reason" required maxLength={500} placeholder="Reden van correctie" className="rounded-lg border bg-background p-2"/>
    <button disabled={busy} className="rounded-lg bg-violet-600 px-4 py-2 font-bold">CORRIGEER</button>
    <p role="status" className="text-sm text-muted-foreground md:col-span-4">{message || `Huidig: ${new Date(startedAt).toLocaleString('nl-BE')}${endedAt ? ` → ${new Date(endedAt).toLocaleString('nl-BE')}` : ' → actief'}`}</p>
  </form>
}
