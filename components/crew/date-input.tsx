'use client'

import { useState } from 'react'

function localInputValue(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function DateInput({ name, initial, required = true }: { name: string; initial?: string; required?: boolean }) {
  const [iso, setIso] = useState(initial || '')
  const [local, setLocal] = useState(() => localInputValue(initial))

  return <label className="grid gap-1 text-sm">
    {name.includes('end') ? 'Einde' : 'Begin'} (lokale tijd)
    <input
      type="datetime-local"
      required={required}
      value={local}
      className="rounded-lg border bg-background p-3"
      onChange={e => {
        setLocal(e.target.value)
        setIso(e.target.value ? new Date(e.target.value).toISOString() : '')
      }}
    />
    <input type="hidden" name={name} value={iso}/>
  </label>
}
