"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { clearLocalPushSubscription,enablePushNotifications,refreshPushBadge,supportsWebPush } from "@/lib/push-client"
import { useAuth } from "@/lib/providers"

type PeriodicSyncManagerLike={
  getTags:()=>Promise<string[]>
  register:(tag:string,options:{minInterval:number})=>Promise<void>
}

export function PwaRegister(){
  const router=useRouter()
  const {user,profile,loading}=useAuth()
  const canUsePush=!loading&&Boolean(user&&profile?.approved)

  useEffect(()=>{
    if(!("serviceWorker" in navigator))return
    if(!loading&&!canUsePush)void clearLocalPushSubscription()

    let disposed=false
    let reloading=false

    const keepFresh=async()=>{
      try{
        const registration=await navigator.serviceWorker.ready
        await registration.update()
        if(canUsePush&&supportsWebPush()&&Notification.permission==="granted"){
          await enablePushNotifications({requestPermission:false})
          await refreshPushBadge()
        }
      }catch{}
    }

    const setup=async()=>{
      try{
        const registration=await navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"})
        await registration.update()

        const periodicSync=(registration as ServiceWorkerRegistration&{periodicSync?:PeriodicSyncManagerLike}).periodicSync
        if(periodicSync){
          try{
            const tags=await periodicSync.getTags()
            if(!tags.includes("uptilldawn-app-refresh")){
              await periodicSync.register("uptilldawn-app-refresh",{minInterval:60*60*1000})
            }
          }catch{}
        }

        if(!disposed&&canUsePush&&supportsWebPush()&&Notification.permission==="granted"){
          await enablePushNotifications({requestPermission:false})
          await refreshPushBadge()
        }
      }catch(error){
        console.error("[PWA] service worker registration failed",error)
      }
    }

    const onMessage=(event:MessageEvent)=>{
      if(event.data?.type==="UPT_PUSH_REFRESH"){
        router.refresh()
        void refreshPushBadge()
      }
    }
    const onFocus=()=>void keepFresh()
    const onOnline=()=>void keepFresh()
    const onVisibility=()=>{if(document.visibilityState==="visible")void keepFresh()}
    const onControllerChange=()=>{
      if(reloading||document.visibilityState!=="visible")return
      reloading=true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener("message",onMessage)
    navigator.serviceWorker.addEventListener("controllerchange",onControllerChange)
    window.addEventListener("focus",onFocus)
    window.addEventListener("online",onOnline)
    document.addEventListener("visibilitychange",onVisibility)
    void setup()

    return()=>{
      disposed=true
      navigator.serviceWorker.removeEventListener("message",onMessage)
      navigator.serviceWorker.removeEventListener("controllerchange",onControllerChange)
      window.removeEventListener("focus",onFocus)
      window.removeEventListener("online",onOnline)
      document.removeEventListener("visibilitychange",onVisibility)
    }
  },[canUsePush,loading,router])

  return null
}
