'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ImagePlus, Send, Users, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/crew-client'
import { enqueue, enqueueChatPhoto } from '@/lib/crew-queue'
import type { Database, Tables } from '@/types/crew-database'

type CrewMember = Database['public']['Functions']['upt_crew_directory']['Returns'][number]
type PrivatePeer = Database['public']['Functions']['upt_private_chat_peers']['Returns'][number]

export function ChatClient({
  channels,
  defaultChannelId,
  userId,
  crewDirectory,
  privatePeers,
  isAdmin,
  profilePhotoUrls,
}: {
  channels: Tables<'chat_channels'>[]
  defaultChannelId: string
  userId: string
  crewDirectory: CrewMember[]
  privatePeers: PrivatePeer[]
  isAdmin: boolean
  profilePhotoUrls: Record<string, string>
}) {
  const router = useRouter()
  const [selected, setSelected] = useState(defaultChannelId || channels[0]?.id || '')
  const [messages, setMessages] = useState<Tables<'messages'>[]>([])
  const [attachments, setAttachments] = useState<Record<string, string[]>>({})
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const [target, setTarget] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const effectiveSelected = selected && channels.some(channel => channel.id === selected)
    ? selected
    : defaultChannelId || channels[0]?.id || ''

  useEffect(() => {
    if (!effectiveSelected) return
    const s = createClient()
    let alive = true

    async function load() {
      const { data, error } = await s.from('messages').select('*').eq('channel_id', effectiveSelected).order('created_at', { ascending: false }).limit(100)
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
    const channel = s.channel(`crew-chat-${effectiveSelected}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${effectiveSelected}` }, () => void load())
      .subscribe()
    const timer = setInterval(() => void load(), 10_000)
    return () => {
      alive = false
      clearInterval(timer)
      void s.removeChannel(channel)
    }
  }, [effectiveSelected])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, effectiveSelected])

  const privatePeerByChannel = useMemo(
    () => new Map(privatePeers.map(peer => [peer.channel_id, peer])),
    [privatePeers],
  )

  const channelName = (channel: Tables<'chat_channels'>) =>
    channel.kind === 'organization'
      ? 'Algemene chat'
      : channel.kind === 'private'
        ? privatePeerByChannel.get(channel.id)?.full_name || 'Privé gesprek'
        : channel.name || channel.kind

  const selectedChannel = channels.find(channel => channel.id === effectiveSelected)
  const selectedPeer = selectedChannel?.kind === 'private'
    ? privatePeerByChannel.get(selectedChannel.id)
    : undefined
  const selectedPhoto = selectedPeer ? profilePhotoUrls[selectedPeer.user_id] : undefined

  const channelGroups = [
    { label: 'Algemeen', channels: channels.filter(channel => channel.kind === 'organization') },
    { label: 'Evenementen', channels: channels.filter(channel => channel.kind === 'event' || channel.kind === 'workplace') },
    { label: 'Privé', channels: channels.filter(channel => channel.kind === 'private') },
  ].filter(group => group.channels.length)

  function chooseChannel(id: string) {
    setSelected(id)
    setMessages([])
    setAttachments({})
    setPickerOpen(false)
    setStatus('')
  }

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
      setPickerOpen(false)
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
    if (busy || !effectiveSelected || (!trimmed && !file)) return
    setBusy(true)
    setStatus('')

    try {
      if (file) {
        await enqueueChatPhoto(userId, effectiveSelected, trimmed, file)
        setBody('')
        setFile(null)
        setFileKey(key => key + 1)
        setStatus(navigator.onLine
          ? 'Foto en bericht zijn bewaard voor serververwerking.'
          : 'Foto en bericht zijn lokaal bewaard en worden verzonden zodra je online bent.')
      } else {
        await enqueue(userId, 'message', { channel_id: effectiveSelected, body: trimmed })
        setBody('')
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

  if (!selectedChannel) {
    return <section className="rounded-2xl border p-6">
      <h1 className="text-2xl font-black">Chat</h1>
      <p className="mt-2 text-muted-foreground">Er zijn momenteel geen beschikbare chats.</p>
    </section>
  }

  return <section className="relative flex min-h-[calc(100dvh-9rem)] flex-col overflow-hidden bg-background md:min-h-[70vh] md:rounded-3xl md:border">
    <header className="sticky top-0 z-30 border-b bg-background/95 px-3 py-3 backdrop-blur md:px-4">
      <button
        type="button"
        onClick={() => setPickerOpen(open => !open)}
        className="flex w-full items-center gap-3 rounded-2xl p-1 text-left hover:bg-muted/60"
        aria-expanded={pickerOpen}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
          {selectedPhoto
            ? <>
                {/* Private signed storage URL. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectedPhoto} alt="" className="h-full w-full object-cover"/>
              </>
            : <Users className="h-5 w-5"/>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black">{channelName(selectedChannel)}</p>
          <p className="text-xs text-muted-foreground">Tik om van chat te wisselen</p>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${pickerOpen ? 'rotate-180' : ''}`}/>
      </button>

      {pickerOpen && <div className="absolute left-3 right-3 top-[4.5rem] z-40 max-h-[65vh] overflow-y-auto rounded-2xl border bg-card p-2 shadow-2xl md:left-4 md:right-4">
        <div className="flex items-center justify-between px-2 py-1">
          <p className="text-sm font-black">Chats</p>
          <button type="button" onClick={() => setPickerOpen(false)} className="rounded-full p-2 hover:bg-muted" aria-label="Sluiten">
            <X className="h-4 w-4"/>
          </button>
        </div>

        {channelGroups.map(group => <div key={group.label} className="mt-2">
          <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-[.16em] text-muted-foreground">{group.label}</p>
          <div className="space-y-1">
            {group.channels.map(channel => <button
              type="button"
              key={channel.id}
              onClick={() => chooseChannel(channel.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${channel.id === effectiveSelected ? 'bg-violet-600 text-white' : 'hover:bg-muted'}`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-current/15 bg-black/10">
                <Users className="h-4 w-4"/>
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{channelName(channel)}</span>
            </button>)}
          </div>
        </div>)}

        <div className="mt-3 border-t pt-3">
          <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[.16em] text-muted-foreground">Nieuwe privéchat</p>
          <div className="flex gap-2">
            <select aria-label="Crewlid voor privéchat" value={target} onChange={e => setTarget(e.target.value)} className="min-w-0 flex-1 rounded-xl border bg-background p-2.5 text-sm">
              <option value="">Crewlid kiezen…</option>
              {crewDirectory.filter(member => member.id !== userId).map(member =>
                <option key={member.id} value={member.id}>{member.full_name || 'Crewlid'}</option>,
              )}
            </select>
            <button type="button" disabled={!target || busy} onClick={createPrivateChat} className="rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50">Open</button>
          </div>
        </div>
      </div>}
    </header>

    <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-5">
      {!messages.length && <p className="py-10 text-center text-sm text-muted-foreground">Nog geen berichten in deze chat.</p>}

      {messages.map(message => {
        const sender = crewDirectory.find(member => member.id === message.sender_id)
        const mine = message.sender_id === userId
        const moderated = Boolean(message.moderated_at)
        const senderName = mine ? 'Jij' : sender?.full_name || 'Crew'
        const fullNameForInitials = mine
          ? crewDirectory.find(member => member.id === userId)?.full_name || 'Jij'
          : senderName
        const initials = fullNameForInitials.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
        const photoUrl = message.sender_id ? profilePhotoUrls[message.sender_id] : undefined
        const timestamp = selectedChannel.kind === 'organization'
          ? new Date(message.created_at).toLocaleString('nl-BE')
          : new Date(message.created_at).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })

        return <article key={message.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
          {!mine && <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border bg-muted">
            {photoUrl
              ? <>
                  {/* Private signed storage URL. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl} alt={`Profielfoto van ${senderName}`} className="h-full w-full object-cover"/>
                </>
              : <div className="flex h-full w-full items-center justify-center text-[10px] font-black">{initials}</div>}
          </div>}

          <div className={`max-w-[82%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
            {!mine && <p className="mb-1 px-1 text-xs font-bold text-muted-foreground">{senderName}</p>}
            <div className={`rounded-2xl px-3.5 py-2.5 shadow-sm ${mine ? 'rounded-br-md bg-violet-600 text-white' : 'rounded-bl-md border bg-card'}`}>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{moderated ? 'Bericht verwijderd door administrator' : message.body}</p>

              {!moderated && attachments[message.id]?.map(url => <a key={url} href={url} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-white/15">
                {/* Private signed storage URL. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Chatfoto" className="max-h-80 w-full object-contain bg-black/20"/>
              </a>)}

              <div className={`mt-1.5 flex items-center justify-end gap-2 text-[10px] ${mine ? 'text-white/75' : 'text-muted-foreground'}`}>
                <time dateTime={message.created_at}>{timestamp}</time>
                {isAdmin && !moderated && <button type="button" disabled={busy} onClick={() => moderate(message.id)} className="underline">Modereer</button>}
              </div>
            </div>
          </div>
        </article>
      })}
      <div ref={endRef}/>
    </div>

    <div className="sticky bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
      {file && <div className="mb-2 flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-xs">
        <span className="truncate">{file.name}</span>
        <button type="button" onClick={() => { setFile(null); setFileKey(key => key + 1) }} className="ml-3 rounded-full p-1 hover:bg-muted" aria-label="Foto verwijderen">
          <X className="h-4 w-4"/>
        </button>
      </div>}

      <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); void sendMessage() }}>
        <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-card hover:bg-muted" aria-label="Foto toevoegen">
          <ImagePlus className="h-5 w-5"/>
          <input
            key={fileKey}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={event => setFile(event.target.files?.[0] || null)}
            className="sr-only"
          />
        </label>

        <textarea
          aria-label="Bericht"
          maxLength={4000}
          rows={1}
          value={body}
          onChange={event => setBody(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void sendMessage()
            }
          }}
          placeholder="Typ een bericht…"
          className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-2xl border bg-card px-4 py-3 text-sm outline-none focus:border-violet-500"
        />

        <button
          disabled={busy || !effectiveSelected || (!body.trim() && !file)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white disabled:opacity-40"
          aria-label="Versturen"
        >
          <Send className="h-5 w-5"/>
        </button>
      </form>

      {status && <p role="status" className="mt-2 text-center text-xs text-muted-foreground">{status}</p>}
    </div>
  </section>
}
