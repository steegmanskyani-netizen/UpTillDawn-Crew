'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-client'
import { enqueue, enqueueChatPhoto } from '@/lib/crew-queue'
import type { Database, Tables } from '@/types/crew-database'

type CrewMember = Database['public']['Functions']['upt_crew_directory']['Returns'][number]
type PrivatePeer = Database['public']['Functions']['upt_private_chat_peers']['Returns'][number]

export function ChatClient({
  channels,
  userId,
  crewDirectory,
  privatePeers,
  isAdmin,
}: {
  channels: Tables<'chat_channels'>[]
  userId: string
  crewDirectory: CrewMember[]
  privatePeers: PrivatePeer[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState(channels[0]?.id || '')
  const [messages, setMessages] = useState<Tables<'messages'>[]>([])
  const [attachments, setAttachments] = useState<Record<string, string[]>>({})
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const [target, setTarget] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!selected && channels[0]?.id) setSelected(channels[0].id)
  }, [channels, selected])

  useEffect(() => {
    if (!selected) return
    const s = createClient()
    let alive = true

    async function load() {
      const { data, error } = await s.from('messages').select('*').eq('channel_id', selected).order('created_at', { ascending: false }).limit(100)
      if (!alive) return
      if (error) {
        setStatus('Berichten konden niet worden geladen.')
        return
      }

      const ordered = (data || []).reverse()
      setMessages(ordered)
      const ids = ordered.map(m => m.id)
      if (!ids.length) {
        setAttachments({})
        return
      }

      const { data: rows } = await s.from('message_attachments').select('message_id,storage_path').in('message_id', ids)
      const signed = await Promise.all((rows || []).filter(a => a.storage_path).map(async a => {
        const { data: url } = await s.storage.from('chat-attachments').createSignedUrl(a.storage_path!, 300)
        return url?.signedUrl ? { messageId: a.message_id, url: url.signedUrl } : null
      }))
      if (!alive) return
      const grouped: Record<string, string[]> = {}
      for (const item of signed) {
        if (!item) continue
        ;(grouped[item.messageId] ||= []).push(item.url)
      }
      setAttachments(grouped)
    }

    void load()
    const channel = s.channel(`crew-chat-${selected}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${selected}` }, () => void load())
      .subscribe()
    const timer = setInterval(() => void load(), 10_000)
    return () => {
      alive = false
      clearInterval(timer)
      void s.removeChannel(channel)
    }
  }, [selected])

  const privatePeerByChannel = new Map(privatePeers.map(p => [p.channel_id, p]))
  const channelName = (channel: Tables<'chat_channels'>) =>
    channel.kind === 'private'
      ? privatePeerByChannel.get(channel.id)?.full_name || 'Privé gesprek'
      : channel.name || channel.kind

  async function createPrivateChat() {
    if (!target || busy) return
    setBusy(true)
    setStatus('')
    try {
      const s = createClient()
      const { data, error } = await s.rpc('upt_create_private_chat', { p_user: target })
      if (error) throw error
      setSelected(data)
      setTarget('')
      setStatus('Privé gesprek geopend.')
      router.refresh()
    } catch {
      setStatus('Privé gesprek kon niet worden geopend.')
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage() {
    const trimmed = body.trim()
    if (busy || !selected || (!trimmed && !file)) return
    setBusy(true)
    setStatus('')

    try {
      if (file) {
        await enqueueChatPhoto(userId, selected, trimmed, file)
        setBody('')
        setFile(null)
        setFileKey(k => k + 1)
        setStatus(navigator.onLine
          ? 'Foto en bericht zijn bewaard voor serververwerking.'
          : 'Foto en bericht zijn lokaal bewaard en worden verzonden zodra je online bent.')
      } else {
        await enqueue(userId, 'message', { channel_id: selected, body: trimmed })
        setBody('')
        setStatus('Bericht bewaard voor verzending.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Bericht kon niet worden bewaard.')
    } finally {
      setBusy(false)
    }
  }

  async function moderate(messageId: string) {
    const reason = window.prompt('Reden voor moderatie (wordt geaudit):')?.trim()
    if (!reason || busy) return
    setBusy(true)
    try {
      const s = createClient()
      const { error } = await s.rpc('upt_moderate_message', { p_message: messageId, p_reason: reason })
      if (error) throw error
      setStatus('Bericht gemodereerd.')
    } catch {
      setStatus('Moderatie mislukt.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="space-y-4">
    <div className="grid gap-2 md:grid-cols-[1fr_auto]">
      <select aria-label="Chatkanaal" className="w-full rounded-xl border bg-background p-3" value={selected} onChange={e => { setSelected(e.target.value); setMessages([]); setAttachments({}) }}>
        {channels.map(c => <option value={c.id} key={c.id}>{channelName(c)}</option>)}
      </select>
      <div className="flex gap-2">
        <select aria-label="Crewlid voor privéchat" value={target} onChange={e => setTarget(e.target.value)} className="min-w-0 flex-1 rounded-xl border bg-background p-3">
          <option value="">Nieuwe privéchat…</option>
          {crewDirectory.filter(c => c.id !== userId).map(c => <option key={c.id} value={c.id}>{c.full_name || 'Crewlid'}</option>)}
        </select>
        <button type="button" disabled={!target || busy} onClick={createPrivateChat} className="rounded-xl border px-4">Open</button>
      </div>
    </div>

    <div className="space-y-3">
      {messages.map(m => {
        const sender = crewDirectory.find(c => c.id === m.sender_id)
        const moderated = Boolean(m.moderated_at)
        return <article key={m.id} className="rounded-xl border p-3">
          <p className="whitespace-pre-wrap">{moderated ? 'Bericht verwijderd door administrator' : m.body}</p>
          {!moderated && attachments[m.id]?.map(url => <a key={url} href={url} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-xl border">
            {/* Private signed storage URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Chatfoto" className="max-h-80 w-full object-contain bg-black/20"/>
          </a>)}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{m.sender_id === userId ? 'Jij' : sender?.full_name || 'Crew'} · {new Date(m.created_at).toLocaleString('nl-BE')}</p>
            {isAdmin && !moderated && <button type="button" disabled={busy} onClick={() => moderate(m.id)} className="text-xs underline">Modereer</button>}
          </div>
        </article>
      })}
    </div>

    <form className="space-y-2" onSubmit={e => { e.preventDefault(); void sendMessage() }}>
      <div className="flex gap-3">
        <input aria-label="Bericht" maxLength={4000} value={body} onChange={e => setBody(e.target.value)} placeholder="Bericht…" className="min-w-0 flex-1 rounded-xl border bg-background p-3"/>
        <button disabled={busy || !selected || (!body.trim() && !file)} className="rounded-xl bg-violet-600 p-3">Versturen</button>
      </div>
      <label className="block text-sm text-muted-foreground">Optionele foto
        <input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} className="mt-1 block w-full rounded-xl border bg-background p-2"/>
      </label>
      {file && <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
    </form>
    {status && <p role="status">{status}</p>}
  </section>
}
