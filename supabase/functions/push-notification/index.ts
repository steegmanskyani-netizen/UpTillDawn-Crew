import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.106.2"
import webpush from "npm:web-push@3.6.7"

type PushConfig={
  vapid_public_key:string
  vapid_private_key:string
  webhook_secret:string
}

type PushSubscriptionRow={
  id:string
  endpoint:string
  p256dh:string
  auth_key:string
}

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},
})

function safePushEndpoint(value:string){
  try{
    const url=new URL(value)
    if(url.protocol!=="https:"||url.username||url.password)return false
    const host=url.hostname.replace(/^\[|\]$/g,"").toLowerCase()
    if(!host||host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal"))return false
    if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)){
      const parts=host.split(".").map(Number)
      if(parts.some(part=>part<0||part>255))return false
      const [a,b]=parts
      if(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168))return false
    }
    if(host.includes(":")){
      if(host==="::"||host==="::1"||/^f[cd]/.test(host)||/^fe[89ab]/.test(host))return false
    }
    return true
  }catch{return false}
}

function safeNotificationLink(value:unknown){
  return typeof value==="string"
    && value.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("\\")
    ? value
    : "/notifications"
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405)

  const supabaseUrl=Deno.env.get("SUPABASE_URL")
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if(!supabaseUrl||!serviceKey)return json({error:"Server configuration missing"},500)

  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:configRows,error:configError}=await admin.rpc("upt_push_delivery_config")
  if(configError){
    console.error("[push] config",configError.message)
    return json({error:"Push configuration unavailable"},500)
  }
  const config=(Array.isArray(configRows)?configRows[0]:configRows) as PushConfig|undefined
  if(!config)return json({error:"Push configuration unavailable"},500)

  const supplied=req.headers.get("x-upt-push-secret")||""
  if(!supplied||supplied!==config.webhook_secret)return json({error:"Unauthorized"},401)

  const payload=await req.json().catch(()=>null) as {notification_id?:string}|null
  const notificationId=payload?.notification_id
  if(!notificationId)return json({error:"notification_id required"},400)

  const {data:notification,error:notificationError}=await admin
    .from("crew_notifications")
    .select("id,user_id,title,body,kind,link,created_at")
    .eq("id",notificationId)
    .maybeSingle()
  if(notificationError){
    console.error("[push] notification",notificationError.message)
    return json({error:"Notification lookup failed"},500)
  }
  if(!notification)return json({error:"Notification not found"},404)

  const [{data:subscriptions,error:subscriptionError},{count:unreadCount,error:countError}]=await Promise.all([
    admin.from("push_subscriptions").select("id,endpoint,p256dh,auth_key").eq("user_id",notification.user_id).eq("enabled",true),
    admin.from("crew_notifications").select("id",{count:"exact",head:true}).eq("user_id",notification.user_id).is("read_at",null),
  ])
  if(subscriptionError){
    console.error("[push] subscriptions",subscriptionError.message)
    return json({error:"Subscription lookup failed"},500)
  }
  if(countError)console.error("[push] unread count",countError.message)
  if(!subscriptions?.length)return json({sent:0,removed:0,failed:0})

  webpush.setVapidDetails(
    "https://uptilldawn-crew.steegmans-kyani.workers.dev",
    config.vapid_public_key,
    config.vapid_private_key,
  )

  const body=JSON.stringify({
    notificationId:notification.id,
    title:String(notification.title||"Up Till Dawn").slice(0,120),
    body:String(notification.body||"").slice(0,700),
    kind:String(notification.kind||"info").slice(0,80),
    link:safeNotificationLink(notification.link),
    createdAt:notification.created_at,
    badgeCount:unreadCount??1,
  })

  let sent=0
  let removed=0
  let failed=0
  for(const sub of subscriptions as PushSubscriptionRow[]){
    if(!safePushEndpoint(sub.endpoint)){
      const {error:deleteError}=await admin.from("push_subscriptions").delete().eq("id",sub.id)
      if(deleteError){failed++;console.error("[push] remove unsafe endpoint",deleteError.message)}
      else removed++
      continue
    }
    try{
      await webpush.sendNotification({
        endpoint:sub.endpoint,
        keys:{p256dh:sub.p256dh,auth:sub.auth_key},
      },body,{
        TTL:86400,
        urgency:notification.kind==="incident"?"high":"normal",
      })
      sent++
    }catch(error){
      const status=typeof error==="object"&&error&&"statusCode" in error
        ? Number((error as {statusCode?:unknown}).statusCode)
        : 0
      if(status===404||status===410){
        const {error:deleteError}=await admin.from("push_subscriptions").delete().eq("id",sub.id)
        if(deleteError)console.error("[push] remove expired",deleteError.message)
        else removed++
      }else{
        failed++
        console.error("[push] delivery failed",{status,message:error instanceof Error?error.message:"unknown"})
      }
    }
  }
  return json({sent,removed,failed})
})
