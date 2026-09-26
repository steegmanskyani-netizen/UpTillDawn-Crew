'use client'

import { useRef, useState } from 'react'

const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.txt,.csv,image/jpeg,image/png,image/webp'

type Analysis = { title: string; instructions: string }

export function BriefingAnalysisFields({
  titleName = 'title',
  bodyName = 'body',
  titlePlaceholder = 'Titel',
  bodyPlaceholder = 'Algemene instructie',
  defaultTitle = '',
  defaultBody = '',
}: {
  titleName?: string
  bodyName?: string
  titlePlaceholder?: string
  bodyPlaceholder?: string
  defaultTitle?: string
  defaultBody?: string
}) {
  const [title, setTitle] = useState(defaultTitle)
  const [body, setBody] = useState(defaultBody)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function analyze(file: File) {
    setBusy(true)
    setMessage('Bestand wordt gelezen…')
    try {
      const form = new FormData()
      form.set('file', file)
      const response = await fetch('/api/briefing-analyze', { method: 'POST', body: form })
      const result = await response.json() as Analysis & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Analyse mislukt.')
      setTitle(result.title)
      setBody(result.instructions)
      setMessage('Titel en instructies zijn automatisch ingevuld. Controleer ze voor opslaan.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Analyse mislukt.')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <label className="grid gap-1 text-sm rounded-xl border border-dashed p-3">
      Briefingbestand automatisch uitlezen
      <input
        ref={inputRef}
        name="briefing_document"
        type="file"
        accept={ACCEPT}
        disabled={busy}
        className="rounded-lg border bg-background p-2"
        onChange={event => {
          const file = event.target.files?.[0]
          if (file) void analyze(file)
        }}
      />
      <span className="text-xs text-muted-foreground">PDF, DOCX, PPTX, XLSX, TXT, CSV, JPG, PNG of WEBP · maximaal 20 MB.</span>
      {message && <span className="text-xs">{message}</span>}
    </label>
    <input name={titleName} required placeholder={titlePlaceholder} className="border bg-background p-3" value={title} onChange={event => setTitle(event.target.value)}/>
    <textarea name={bodyName} required placeholder={bodyPlaceholder} className="min-h-28 border bg-background p-3" value={body} onChange={event => setBody(event.target.value)}/>
  </>
}
