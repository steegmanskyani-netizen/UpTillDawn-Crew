"use client"

export type PushState="unsupported"|"needs_install"|"default"|"denied"|"granted"|"error"

type PushConfig={publicKey:string;unreadCount:number}

function base64UrlToUint8Array(value:string){
  const padding="=".repeat((4-(value.length%4))%4)
  const base64=(value+padding).replace(/-/g,"+").replace(/_/g,"/")
  const raw=window.atob(base64)
  const output=new Uint8Array(raw.length)
  for(let i=0;i<raw.length;i++)output[i]=raw.charCodeAt(i)
  return output
}

export function isInstalledPwa(){
  if(typeof window==="undefined")return false
  const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches===true
  const iosStandalone=(window.navigator as Navigator&{standalone?:boolean}).standalone===true
  return standalone||iosStandalone
}

function isIosDevice(){
  if(typeof navigator==="undefined")return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function supportsWebPush(){
  return typeof window!=="undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
}

async function fetchPushConfig():Promise<PushConfig>{
  const response=await fetch("/api/push/config",{credentials:"include",cache:"no-store"})
  if(!response.ok)throw new Error("Push-configuratie kon niet worden geladen.")
  return response.json() as Promise<PushConfig>
}

async function saveSubscription(subscription:PushSubscription){
  const json=subscription.toJSON()
  const p256dh=json.keys?.p256dh
  const auth=json.keys?.auth
  if(!json.endpoint||!p256dh||!auth)throw new Error("Ongeldige push-subscriptie.")
  const response=await fetch("/api/push/subscription",{
    method:"POST",
    credentials:"include",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({endpoint:json.endpoint,keys:{p256dh,auth}}),
  })
  if(!response.ok)throw new Error("Push-subscriptie kon niet worden opgeslagen.")
}

async function updateBadge(unreadCount:number){
  const badgeNavigator=navigator as Navigator&{
    setAppBadge?:(count?:number)=>Promise<void>
    clearAppBadge?:()=>Promise<void>
  }
  try{
    if(unreadCount>0&&badgeNavigator.setAppBadge)await badgeNavigator.setAppBadge(unreadCount)
    else if(unreadCount===0&&badgeNavigator.clearAppBadge)await badgeNavigator.clearAppBadge()
  }catch{}
}

export async function getPushState():Promise<PushState>{
  if(!supportsWebPush())return "unsupported"
  if(isIosDevice()&&!isInstalledPwa())return "needs_install"
  if(Notification.permission==="denied")return "denied"
  if(Notification.permission==="default")return "default"
  try{
    const registration=await navigator.serviceWorker.ready
    const subscription=await registration.pushManager.getSubscription()
    return subscription?"granted":"default"
  }catch{
    return "error"
  }
}

export async function enablePushNotifications({requestPermission=true}:{requestPermission?:boolean}={}):Promise<PushState>{
  if(!supportsWebPush())return "unsupported"
  if(isIosDevice()&&!isInstalledPwa())return "needs_install"

  let permission=Notification.permission
  if(permission==="default"&&requestPermission)permission=await Notification.requestPermission()
  if(permission==="denied")return "denied"
  if(permission!=="granted")return "default"

  try{
    const [registration,config]=await Promise.all([
      navigator.serviceWorker.ready,
      fetchPushConfig(),
    ])
    let subscription=await registration.pushManager.getSubscription()
    if(!subscription){
      subscription=await registration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:base64UrlToUint8Array(config.publicKey),
      })
    }
    await saveSubscription(subscription)
    await updateBadge(config.unreadCount)
    return "granted"
  }catch(error){
    console.error("[Push] enable failed",error)
    return "error"
  }
}

export async function disablePushNotifications():Promise<PushState>{
  if(!supportsWebPush())return "unsupported"
  try{
    const registration=await navigator.serviceWorker.ready
    const subscription=await registration.pushManager.getSubscription()
    if(subscription){
      await fetch("/api/push/subscription",{
        method:"DELETE",
        credentials:"include",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({endpoint:subscription.endpoint}),
      }).catch(()=>null)
      await subscription.unsubscribe()
    }
    const badgeNavigator=navigator as Navigator&{clearAppBadge?:()=>Promise<void>}
    await badgeNavigator.clearAppBadge?.().catch(()=>{})
    return Notification.permission==="denied"?"denied":"default"
  }catch(error){
    console.error("[Push] disable failed",error)
    return "error"
  }
}

export async function refreshPushBadge(){
  if(!supportsWebPush()||Notification.permission!=="granted")return
  try{
    const config=await fetchPushConfig()
    await updateBadge(config.unreadCount)
  }catch{}
}
