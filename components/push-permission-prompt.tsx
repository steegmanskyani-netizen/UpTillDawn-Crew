"use client"

import { useEffect,useState } from "react"
import { BellRing } from "lucide-react"
import { enablePushNotifications,getPushState,isInstalledPwa,type PushState } from "@/lib/push-client"
import { useAuth } from "@/lib/providers"

const WEEK=7*24*60*60*1000

export function PushPermissionPrompt(){
  const {user,profile,loading}=useAuth()
  const canPrompt=!loading&&Boolean(user&&profile?.approved)
  const [visible,setVisible]=useState(false)
  const [busy,setBusy]=useState(false)
  const [state,setState]=useState<PushState>("default")

  useEffect(()=>{
    let cancelled=false
    if(!canPrompt)return()=>{cancelled=true}
    void (async()=>{
      if(!isInstalledPwa())return
      const current=await getPushState()
      if(cancelled)return
      setState(current)
      const dismissed=Number(localStorage.getItem("upt-push-prompt-dismissed")||0)
      setVisible(current==="default"&&(!dismissed||Date.now()-dismissed>WEEK))
    })()
    return()=>{cancelled=true}
  },[canPrompt])

  if(!canPrompt||!visible)return null

  const enable=async()=>{
    setBusy(true)
    const next=await enablePushNotifications({requestPermission:true})
    setState(next)
    setBusy(false)
    if(next==="granted")setVisible(false)
  }

  const later=()=>{
    localStorage.setItem("upt-push-prompt-dismissed",String(Date.now()))
    setVisible(false)
  }

  return <aside className="fixed inset-x-3 bottom-20 z-[70] rounded-2xl border border-violet-500/40 bg-card p-4 shadow-2xl md:bottom-4 md:left-auto md:max-w-sm" aria-live="polite">
    <div className="flex gap-3">
      <BellRing className="mt-1 h-5 w-5 shrink-0 text-violet-400"/>
      <div className="min-w-0 flex-1">
        <p className="font-black">Pushmeldingen inschakelen?</p>
        <p className="mt-1 text-sm text-muted-foreground">Ontvang meldingen van Up Till Dawn ook wanneer de app niet open staat.</p>
        {state==="error"&&<p className="mt-2 text-xs text-red-400">Activeren is niet gelukt. Probeer opnieuw.</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy} onClick={()=>void enable()} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold disabled:opacity-50">{busy?"ACTIVEREN…":"TOESTAAN"}</button>
          <button type="button" onClick={later} className="rounded-lg border px-3 py-2 text-sm">Later</button>
        </div>
      </div>
    </div>
  </aside>
}
