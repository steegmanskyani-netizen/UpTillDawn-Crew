"use client"

import { useEffect,useMemo,useState } from "react"
import { Download,Share2,X } from "lucide-react"
import { createClient } from "@/lib/supabase/crew-client"
import { useAuth } from "@/lib/providers"
import { isInstalledPwa } from "@/lib/push-client"

type InstallPromptEvent=Event&{
  prompt:()=>Promise<void>
  userChoice:Promise<{outcome:"accepted"|"dismissed";platform:string}>
}

const DISMISS_MS=7*24*60*60*1000

function isIos(){
  if(typeof navigator==="undefined")return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function FirstUseInstallPrompt(){
  const {user,loading}=useAuth()
  const db=useMemo(()=>createClient(),[])
  const [deferred,setDeferred]=useState<InstallPromptEvent|null>(null)
  const [visible,setVisible]=useState(false)
  const [iosHelp,setIosHelp]=useState(false)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState("")

  useEffect(()=>{
    const handler=(event:Event)=>{
      event.preventDefault()
      setDeferred(event as InstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt",handler)
    return()=>window.removeEventListener("beforeinstallprompt",handler)
  },[])

  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      if(loading||!user||isInstalledPwa()){setVisible(false);return}
      const pending=user.user_metadata?.pwa_install_prompt_pending===true
      const dismissed=Number(localStorage.getItem("upt-pwa-install-dismissed")||0)
      setVisible(Boolean(pending&&(!dismissed||Date.now()-dismissed>DISMISS_MS)))
    },0)
    return()=>window.clearTimeout(timer)
  },[loading,user])

  useEffect(()=>{
    const installed=()=>{
      setVisible(false)
      setMessage("")
      localStorage.removeItem("upt-pwa-install-dismissed")
      if(user)void db.auth.updateUser({data:{pwa_install_prompt_pending:false}})
    }
    window.addEventListener("appinstalled",installed)
    return()=>window.removeEventListener("appinstalled",installed)
  },[db,user])

  if(!visible||!user)return null

  async function finish(){
    localStorage.removeItem("upt-pwa-install-dismissed")
    await db.auth.updateUser({data:{pwa_install_prompt_pending:false}})
    setVisible(false)
  }

  async function confirm(){
    setBusy(true)
    setMessage("")
    try{
      if(isInstalledPwa()){
        await finish()
        return
      }
      if(deferred){
        await deferred.prompt()
        const choice=await deferred.userChoice
        setDeferred(null)
        if(choice.outcome==="accepted"){
          setMessage("App-installatie bevestigd. Open Up Till Dawn via het nieuwe app-icoon zodra je browser de installatie heeft afgerond.")
          window.setTimeout(()=>void finish(),1200)
        }else{
          localStorage.setItem("upt-pwa-install-dismissed",String(Date.now()))
          setVisible(false)
        }
        return
      }
      if(isIos()){
        setIosHelp(true)
        setMessage("Safari vereist één handmatige bevestiging om een webapp op het beginscherm te zetten.")
        return
      }
      setMessage("Open het browsermenu en kies ‘App installeren’ of ‘Toevoegen aan startscherm’. Automatische installatie is door deze browser niet toegestaan.")
    }finally{
      setBusy(false)
    }
  }

  function dismiss(){
    localStorage.setItem("upt-pwa-install-dismissed",String(Date.now()))
    setVisible(false)
  }

  return <aside className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
    <section className="relative w-full max-w-md rounded-3xl border border-white/15 bg-zinc-950 p-6 text-white shadow-2xl">
      <button type="button" aria-label="Installatie weigeren" onClick={dismiss} className="absolute right-3 top-3 rounded-full p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
        <X className="h-4 w-4"/>
      </button>
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-violet-600/20 text-violet-300">
        <Download className="h-6 w-6"/>
      </div>
      <h2 id="pwa-install-title" className="pr-8 text-xl font-black">Up Till Dawn toevoegen aan uw toestel</h2>
      <p className="mt-3 text-sm leading-6 text-zinc-300">Voor makkelijk gebruik, een vlotte workflow en realtime meldingen te ontvangen wordt bij bevestiging de Up Till Dawn app toegevoegd aan uw toestel.</p>

      {iosHelp&&<div className="mt-4 rounded-2xl border border-white/10 bg-black p-4 text-sm">
        <p className="font-bold">iPhone / iPad</p>
        <p className="mt-2 flex items-center gap-2 text-zinc-300"><Share2 className="h-4 w-4 shrink-0"/>Tik in Safari op Deel en kies daarna “Zet op beginscherm”. Open vervolgens de nieuwe Up Till Dawn app.</p>
      </div>}

      {message&&<p role="status" className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-300">{message}</p>}

      <button type="button" disabled={busy} onClick={()=>void confirm()} className="mt-5 w-full rounded-xl bg-white p-3 font-black text-black disabled:opacity-60">
        {busy?"INSTALLATIE STARTEN…":iosHelp?"IK OPEN HET DEELMENU":"BEVESTIGEN"}
      </button>
    </section>
  </aside>
}
