"use client"

import { useEffect,useState } from "react"
import { BellRing,BellOff } from "lucide-react"
import { disablePushNotifications,enablePushNotifications,getPushState,type PushState } from "@/lib/push-client"

function description(state:PushState){
  if(state==="granted")return "Pushmeldingen zijn actief op dit toestel."
  if(state==="denied")return "Meldingen zijn geblokkeerd. Sta ze toe in de instellingen van je browser of toestel."
  if(state==="needs_install")return "Op iPhone/iPad: voeg de website eerst toe aan je beginscherm en open hem als web-app."
  if(state==="unsupported")return "Dit toestel of deze browser ondersteunt geen Web Push."
  if(state==="error")return "De pushinstellingen konden niet worden geladen."
  return "Sta meldingen toe om updates te ontvangen wanneer de app gesloten is."
}

export function PushNotificationSettings(){
  const [state,setState]=useState<PushState>("default")
  const [busy,setBusy]=useState(true)

  useEffect(()=>{
    let cancelled=false
    void (async()=>{
      let next=await getPushState()
      if(next==="default"&&typeof Notification!=="undefined"&&Notification.permission==="granted"){
        next=await enablePushNotifications({requestPermission:false})
      }
      if(!cancelled){setState(next);setBusy(false)}
    })()
    return()=>{cancelled=true}
  },[])

  const enable=async()=>{
    setBusy(true)
    setState(await enablePushNotifications({requestPermission:true}))
    setBusy(false)
  }
  const disable=async()=>{
    setBusy(true)
    setState(await disablePushNotifications())
    setBusy(false)
  }

  return <section className="rounded-2xl border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-4">
      <div className="flex gap-3">
        {state==="granted"?<BellRing className="mt-1 h-5 w-5 text-emerald-400"/>:<BellOff className="mt-1 h-5 w-5 text-muted-foreground"/>}
        <div>
          <h2 className="font-black">App- & pushmeldingen</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description(state)}</p>
        </div>
      </div>
      {state==="granted"&&<span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-300">ACTIEF</span>}
    </div>
    <div className="mt-3">
      {state==="granted"
        ? <button type="button" disabled={busy} onClick={()=>void disable()} className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50">UITSCHAKELEN</button>
        : !["unsupported","needs_install","denied"].includes(state)
          && <button type="button" disabled={busy} onClick={()=>void enable()} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold disabled:opacity-50">{busy?"LADEN…":"PUSHMELDINGEN INSCHAKELEN"}</button>}
    </div>
  </section>
}
