'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/crew-client'

type MissingItem = {
  id: string
  title: string
  link: string
}

type Result = {
  action: string
  kind?: 'start' | 'stop' | 'shift' | 'briefings'
  shift_id?: string
  event_id?: string
  count?: number
  next_start?: string
  reviewer?: 'responsible' | 'admin'
  request_id?: string
  effective_at?: string
  early?: boolean
  no_responsible?: boolean
  items?: MissingItem[]
}

export default function QrShiftRequest() {
  const s = useMemo(() => createClient(), [])
  const [result, setResult] = useState<Result | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  async function perform(contact?: boolean, remote = false) {
    setBusy(true)
    setError('')
    const { data, error } = await s.rpc('upt_qr_request', {
      p_contact_confirmed: contact ?? undefined,
      p_remote: remote,
      p_early_reason: reason.trim() || undefined,
    })
    if (error) setError(error.message)
    else setResult(data as Result)
    setBusy(false)
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await s.rpc('upt_qr_request')
      if (!active) return
      if (error) setError(error.message)
      else setResult(data as Result)
      setBusy(false)
    })()
    return () => {
      active = false
    }
  }, [s])

  async function confirmItem(item: MissingItem, kind: Result['kind']) {
    setBusy(true)
    setError('')
    const response = kind === 'shift'
      ? await s.rpc('upt_confirm_shift', { p_shift: item.id })
      : await s.rpc('upt_acknowledge_briefing', { p_briefing: item.id })
    if (response.error) {
      setError(response.error.message)
      setBusy(false)
      return
    }
    await perform()
  }

  if (busy) {
    return <main className="mx-auto max-w-lg p-6">
      <p>QR-aanvraag wordt gecontroleerd…</p>
    </main>
  }

  return <main className="mx-auto max-w-lg space-y-5 p-6 pb-28">
    <h1 className="text-3xl font-black">Mijn werkuren</h1>

    {error && <p role="alert" className="rounded-xl border border-red-500 p-4">{error}</p>}

    {result?.action === 'outside_window' && <section className="rounded-2xl border p-5">
      <h2 className="font-bold">Geen aanvraag mogelijk</h2>
      <p className="mt-2">Je eerstvolgende shift valt nog buiten het startvenster van 60 minuten.</p>
      {result.next_start && <p className="mt-2">Start: {new Date(result.next_start).toLocaleString('nl-BE')}</p>}
      <Link className="mt-4 inline-block underline" href="/operations">Mijn werkuren openen</Link>
    </section>}

    {result?.action === 'confirm_required' && <section className="space-y-3 rounded-2xl border border-amber-500 p-5">
      <div>
        <h2 className="font-bold">Bevestiging vereist</h2>
        <p className="mt-2">
          {result.kind === 'shift'
            ? 'Bevestig eerst je toegewezen shift.'
            : 'Bevestig eerst alle beschikbare briefings voor deze shift.'}
        </p>
      </div>
      {(result.items || []).map(item => <div key={item.id} className="rounded-xl border p-3">
        <p className="font-semibold">{item.title}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link className="rounded-lg border px-3 py-2 text-sm" href={item.link}>OPENEN</Link>
          <button
            className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white"
            onClick={() => confirmItem(item, result.kind)}
          >
            BEVESTIGEN
          </button>
        </div>
      </div>)}
    </section>}

    {result?.action === 'early_reason_required' && <section className="space-y-3 rounded-2xl border p-5">
      <h2 className="font-bold">Reden vroegtijdige start</h2>
      <p>Je aanvraag gebeurt meer dan 10 minuten voor de shift. Geef de reden op.</p>
      <textarea
        className="min-h-28 w-full rounded-xl border bg-transparent p-3"
        value={reason}
        onChange={event => setReason(event.target.value)}
        placeholder="Reden"
      />
      <button
        disabled={!reason.trim()}
        onClick={() => perform()}
        className="w-full rounded-xl bg-violet-600 p-4 font-bold text-white disabled:opacity-50"
      >
        VERDER
      </button>
    </section>}

    {result?.action === 'contact' && <section className="space-y-4 rounded-2xl border p-5">
      <h2 className="text-xl font-bold">Wend je tot de verantwoordelijke</h2>
      <p>Vraag de verantwoordelijke om je {result.kind === 'stop' ? 'stopuren' : 'starturen'} te behandelen.</p>
      <p className="font-bold">Heb je je kunnen wenden tot de verantwoordelijke?</p>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => perform(true)} className="rounded-xl bg-violet-600 p-4 font-bold text-white">JA</button>
        <button onClick={() => perform(false)} className="rounded-xl border p-4 font-bold">NEE</button>
      </div>
    </section>}

    {result?.action === 'remote_required' && <section className="space-y-4 rounded-2xl border p-5">
      <h2 className="font-bold">Remote aanvraag</h2>
      <p>
        {result.no_responsible
          ? 'Er is momenteel geen beschikbare verantwoordelijke. Je remote aanvraag wordt door admin behandeld.'
          : 'Je kon je niet wenden tot de verantwoordelijke. De remote aanvraag wordt door de verantwoordelijke behandeld.'}
      </p>
      <button
        onClick={() => perform(false, true)}
        className="w-full rounded-xl bg-violet-600 p-4 font-bold text-white"
      >
        REMOTE AANVRAAG
      </button>
    </section>}

    {result?.action === 'pending' && <section className="rounded-2xl border border-amber-500 p-5">
      <h2 className="font-bold">Aanvraag in behandeling</h2>
      <p className="mt-2">
        Je {result.kind === 'stop' ? 'stop' : 'start'}aanvraag wacht nog op een beslissing.
      </p>
      {result.kind === 'stop' && <p className="mt-2">Je werktimer blijft doorlopen tot de aanvraag is beslist. Bij goedkeuring wordt de stoptijd teruggezet naar je aanvraagmoment.</p>}
      <Link className="mt-4 inline-block underline" href="/operations">Mijn werkuren</Link>
    </section>}

    {result?.action === 'requested' && <section className="rounded-2xl border border-emerald-500 p-5">
      <h2 className="font-bold">Aanvraag verzonden</h2>
      <p className="mt-2">
        Je {result.kind === 'stop' ? 'stop' : 'start'}aanvraag wacht op goedkeuring door {result.reviewer === 'admin' ? 'admin' : 'de verantwoordelijke'}.
      </p>
      {result.kind === 'stop' && <p className="mt-2">De timer blijft doorlopen. Na goedkeuring worden je uren gestopt op het aanvraagmoment.</p>}
      {result.kind === 'start' && result.early && <p className="mt-2">Na goedkeuring start je teller vanaf het aanvraagmoment. Admin krijgt daarna een vroegstartcontrole.</p>}
      <Link className="mt-4 inline-block underline" href="/operations">Mijn werkuren</Link>
    </section>}
  </main>
}
