'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ImagePlus, Send, Users, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/crew-client'
import { enqueue, enqueueChatPhoto } from '@/lib/crew-queue'
import type { Database, Tables } from '@/types/crew-database'

type CrewMember=Database['public']['Functions']['upt_crew_directory']['Returns'][number]
type Attachment={url:string;mimeType:string|null}
type ChannelCache={messages:Tables<'messages'>[];attachments:Record<string,Attachment[]>}

function ChannelAvatar({src,size='lg'}:{src?:string;size?:'sm'|'lg'}){
 const classes=size==='lg'?'h-11 w-11':'h-9 w-9'
 return <div className={`flex ${classes} shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted`}>
  {src?<img src={src} alt="" className="h-full w-full object-cover"/>:<Users className={size==='lg'?'h-5 w-5':'h-4 w-4'}/>} 
 </div>
}

export function ChatClient({channels,defaultChannelId,userId,crewDirectory,isAdmin,profilePhotoUrls,channelImages}:{
  channels:Tables<'chat_channels'>[];defaultChannelId:string;userId:string;crewDirectory:CrewMember[];isAdmin:boolean;profilePhotoUrls:Record<string,string>;channelImages:Record<string,string>
}){
  const [selected,setSelected]=useState(defaultChannelId||channels[0]?.id||'')
  const [cache,setCache]=useState<Record<string,ChannelCache>>({});const [body,setBody]=useState('');const [file,setFile]=useState<File|null>(null);const [fileKey,setFileKey]=useState(0);const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);const [pickerOpen,setPickerOpen]=useState(false);const endRef=useRef<HTMLDivElement>(null)
  const effectiveSelected=selected&&channels.some(channel=>channel.id===selected)?selected:defaultChannelId||channels[0]?.id||''
  const current=cache[effectiveSelected]||{messages:[],attachments:{}};const selectedChannel=channels.find(channel=>channel.id===effectiveSelected)

  useEffect(()=>{
    if(!effectiveSelected)return
    const s=createClient();let alive=true
    async function load(){
      const {data,error}=await s.from('messages').select('*').eq('channel_id',effectiveSelected).order('created_at',{ascending:false}).limit(100)
      if(!alive)return;if(error){setStatus('Berichten konden niet worden geladen.');return}
      const ordered=(data||[]).reverse();const ids=ordered.map(message=>message.id);const grouped:Record<string,Attachment[]>={}
      if(ids.length){
        const {data:rows}=await s.from('message_attachments').select('message_id,storage_path,mime_type').in('message_id',ids)
        const signed=await Promise.all((rows||[]).filter(row=>row.storage_path).map(async row=>{const {data:url}=await s.storage.from('chat-attachments').createSignedUrl(row.storage_path!,300);return url?.signedUrl?{messageId:row.message_id,url:url.signedUrl,mimeType:row.mime_type}:null}))
        for(const item of signed){if(!item)continue;(grouped[item.messageId]||=[]).push({url:item.url,mimeType:item.mimeType})}
      }
      if(alive)setCache(previous=>({...previous,[effectiveSelected]:{messages:ordered,attachments:grouped}}))
    }
    void load();const channel=s.channel(`crew-chat-${effectiveSelected}`).on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:`channel_id=eq.${effectiveSelected}`},()=>void load()).subscribe();const timer=window.setInterval(()=>void load(),10000)
    return()=>{alive=false;window.clearInterval(timer);void s.removeChannel(channel)}
  },[effectiveSelected])

  useEffect(()=>{endRef.current?.scrollIntoView({block:'end'})},[current.messages.length,effectiveSelected])
  const directory=useMemo(()=>new Map(crewDirectory.map(member=>[member.id,member])),[crewDirectory])
  const channelName=(channel:Tables<'chat_channels'>)=>channel.kind==='organization'?'Algemene chat':channel.kind==='workplace'?(channel.name||'Werkplekchat'):(channel.name||'Eventchat')
  const eventChannels=channels.filter(channel=>channel.kind==='event');const workplaceChannels=channels.filter(channel=>channel.kind==='workplace');const organizationChannels=channels.filter(channel=>channel.kind==='organization')
  function chooseChannel(id:string){setSelected(id);setPickerOpen(false);setStatus('')}

  async function sendMessage(){
    const trimmed=body.trim();if(busy||!effectiveSelected||(!trimmed&&!file))return;setBusy(true);setStatus('')
    try{if(file){await enqueueChatPhoto(userId,effectiveSelected,trimmed,file);setBody('');setFile(null);setFileKey(key=>key+1);setStatus(navigator.onLine?'Media en bericht zijn bewaard voor serververwerking.':'Media en bericht zijn lokaal bewaard en worden verzonden zodra je online bent.')}else{await enqueue(userId,'message',{channel_id:effectiveSelected,body:trimmed});setBody('')}}catch(error){setStatus(error instanceof Error?error.message:'Bericht kon niet worden bewaard.')}finally{setBusy(false)}
  }
  async function moderate(messageId:string){const reason=window.prompt('Reden voor moderatie (wordt geaudit):')?.trim();if(!reason||busy)return;setBusy(true);try{const s=createClient();const {error}=await s.rpc('upt_moderate_message',{p_message:messageId,p_reason:reason});if(error)throw error;setStatus('Bericht gemodereerd.')}catch{setStatus('Moderatie mislukt.')}finally{setBusy(false)}}

  if(!selectedChannel)return <section className="rounded-2xl border p-6"><h1 className="text-2xl font-black">Chat</h1><p className="mt-2 text-muted-foreground">Er zijn momenteel geen beschikbare chats.</p></section>

  return <section className="relative flex min-h-[calc(100dvh-9rem)] flex-col overflow-hidden bg-background md:min-h-[70vh] md:rounded-3xl md:border">
    <header className="sticky top-0 z-30 border-b bg-background/95 px-3 py-3 backdrop-blur md:px-4">
      <button type="button" onClick={()=>setPickerOpen(open=>!open)} className="flex w-full items-center gap-3 rounded-2xl p-1 text-left hover:bg-muted/60" aria-expanded={pickerOpen}>
        <ChannelAvatar src={channelImages[selectedChannel.id]}/><div className="min-w-0 flex-1"><p className="truncate text-base font-black">{channelName(selectedChannel)}</p><p className="text-xs text-muted-foreground">Tik om van chat te wisselen</p></div><ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${pickerOpen?'rotate-180':''}`}/>
      </button>
      {pickerOpen&&<div className="absolute left-3 right-3 top-[4.5rem] z-40 max-h-[65vh] overflow-y-auto rounded-2xl border bg-card p-2 shadow-2xl md:left-4 md:right-4">
        <div className="flex items-center justify-between px-2 py-1"><p className="text-sm font-black">Gesprekken</p><button type="button" onClick={()=>setPickerOpen(false)} className="rounded-full p-2 hover:bg-muted" aria-label="Sluiten"><X className="h-4 w-4"/></button></div>
        {!!organizationChannels.length&&<div className="mt-2"><p className="px-2 py-1 text-[11px] font-bold uppercase tracking-[.16em] text-muted-foreground">Algemeen</p>{organizationChannels.map(channel=><ChannelButton key={channel.id} channel={channel} selected={effectiveSelected} onChoose={chooseChannel} name={channelName(channel)} image={channelImages[channel.id]}/>)}</div>}
        {!!eventChannels.length&&<div className="mt-2"><p className="px-2 py-1 text-[11px] font-bold uppercase tracking-[.16em] text-muted-foreground">Evenementen</p><div className="space-y-1">{eventChannels.map(channel=><ChannelButton key={channel.id} channel={channel} selected={effectiveSelected} onChoose={chooseChannel} name={channelName(channel)} image={channelImages[channel.id]}/>)}</div></div>}
        {!!workplaceChannels.length&&<div className="mt-2"><p className="px-2 py-1 text-[11px] font-bold uppercase tracking-[.16em] text-muted-foreground">Werkplekken</p><div className="space-y-1">{workplaceChannels.map(channel=><ChannelButton key={channel.id} channel={channel} selected={effectiveSelected} onChoose={chooseChannel} name={channelName(channel)} image={channelImages[channel.id]}/>)}</div></div>}
      </div>}
    </header>

    <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-5">
      {!current.messages.length&&<p className="py-10 text-center text-sm text-muted-foreground">Nog geen berichten in deze chat.</p>}
      {current.messages.map(message=>{
        const sender=message.sender_id?directory.get(message.sender_id):undefined;const mine=message.sender_id===userId;const moderated=Boolean(message.moderated_at);const senderName=mine?'Jij':sender?.full_name||'Personeelslid';const initials=(mine?(directory.get(userId)?.full_name||'Jij'):senderName).split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();const photoUrl=message.sender_id?profilePhotoUrls[message.sender_id]:undefined;const timestamp=selectedChannel.kind==='organization'?new Date(message.created_at).toLocaleString('nl-BE'):new Date(message.created_at).toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit'})
        return <article key={message.id} className={`flex items-end gap-2 ${mine?'justify-end':'justify-start'}`}>
          {!mine&&<div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border bg-muted">{photoUrl?<img src={photoUrl} alt={`Profielfoto van ${senderName}`} className="h-full w-full object-cover"/>:<div className="flex h-full w-full items-center justify-center text-[10px] font-black">{initials}</div>}</div>}
          <div className={`max-w-[82%] ${mine?'items-end':'items-start'} flex flex-col`}>{!mine&&<p className="mb-1 px-1 text-xs font-bold text-muted-foreground">{senderName}</p>}<div className={`rounded-2xl px-3.5 py-2.5 shadow-sm ${mine?'rounded-br-md bg-violet-600 text-white':'rounded-bl-md border bg-card'}`}>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{moderated?'Bericht verwijderd door beheerder':message.body}</p>
            {!moderated&&current.attachments[message.id]?.map((attachment,index)=>attachment.mimeType?.startsWith('video/')?<video key={index} src={attachment.url} controls playsInline className="mt-2 max-h-80 w-full rounded-xl border border-white/15 bg-black"/>:<a key={index} href={attachment.url} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-white/15"><img src={attachment.url} alt="Chatmedia" className="max-h-80 w-full object-contain bg-black/20"/></a>)}
            <div className={`mt-1.5 flex items-center justify-end gap-2 text-[10px] ${mine?'text-white/75':'text-muted-foreground'}`}><time dateTime={message.created_at}>{timestamp}</time>{isAdmin&&!moderated&&<button type="button" disabled={busy} onClick={()=>moderate(message.id)} className="underline">Modereer</button>}</div>
          </div></div>
        </article>
      })}<div ref={endRef}/>
    </div>

    <div className="sticky bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
      {file&&<div className="mb-2 flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-xs"><span className="truncate">{file.name}</span><button type="button" onClick={()=>{setFile(null);setFileKey(key=>key+1)}} className="ml-3 rounded-full p-1 hover:bg-muted" aria-label="Media verwijderen"><X className="h-4 w-4"/></button></div>}
      <form className="flex items-end gap-2" onSubmit={event=>{event.preventDefault();void sendMessage()}}>
        <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-card hover:bg-muted" aria-label="Media toevoegen"><ImagePlus className="h-5 w-5"/><input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={event=>setFile(event.target.files?.[0]||null)} className="sr-only"/></label>
        <textarea aria-label="Bericht" maxLength={4000} rows={2} value={body} onChange={event=>setBody(event.target.value)} placeholder="Typ een bericht…" className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-2xl border bg-card px-4 py-3 text-sm outline-none focus:border-violet-500"/>
        <button type="submit" disabled={busy||!effectiveSelected||(!body.trim()&&!file)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white disabled:opacity-40" aria-label="Versturen"><Send className="h-5 w-5"/></button>
      </form>
      <p className="mt-1 text-center text-[10px] text-muted-foreground">Enter = nieuwe regel · verzenden gebeurt met de knop.</p>{status&&<p role="status" className="mt-2 text-center text-xs text-muted-foreground">{status}</p>}
    </div>
  </section>
}

function ChannelButton({channel,selected,onChoose,name,image}:{channel:Tables<'chat_channels'>;selected:string;onChoose:(id:string)=>void;name:string;image?:string}){
  return <button type="button" onClick={()=>onChoose(channel.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${channel.id===selected?'bg-violet-600 text-white':'hover:bg-muted'}`}><ChannelAvatar src={image} size="sm"/><span className="min-w-0 flex-1 truncate text-sm font-bold">{name}</span></button>
}
