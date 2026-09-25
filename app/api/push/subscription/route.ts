import { z } from "zod"
import { createClient } from "@/lib/supabase/crew-server"

const subscriptionSchema=z.object({
  endpoint:z.string().url().max(4096),
  keys:z.object({
    p256dh:z.string().min(20).max(512),
    auth:z.string().min(8).max(256),
  }),
})
const removeSchema=z.object({endpoint:z.string().url().max(4096)})

function crossSite(request:Request){
  const fetchSite=request.headers.get("sec-fetch-site")
  if(fetchSite==="cross-site")return true
  const origin=request.headers.get("origin")
  return Boolean(origin&&origin!==new URL(request.url).origin)
}

export async function POST(request:Request){
  if(crossSite(request))return Response.json({error:"Ongeldige oorsprong."},{status:403})
  const s=await createClient()
  const {data:{user}}=await s.auth.getUser()
  if(!user)return Response.json({error:"Aanmelden vereist."},{status:401})

  const parsed=subscriptionSchema.safeParse(await request.json().catch(()=>null))
  if(!parsed.success)return Response.json({error:"Ongeldige push-subscriptie."},{status:400})

  const {data,error}=await s.rpc("upt_save_push_subscription",{
    p_endpoint:parsed.data.endpoint,
    p_p256dh:parsed.data.keys.p256dh,
    p_auth:parsed.data.keys.auth,
    p_user_agent:(request.headers.get("user-agent")||"").slice(0,500)||undefined,
  })
  if(error){
    console.error("[Push] save subscription",error.code)
    return Response.json({error:"Push-subscriptie opslaan mislukt."},{status:500})
  }
  return Response.json({ok:true,id:data})
}

export async function DELETE(request:Request){
  if(crossSite(request))return Response.json({error:"Ongeldige oorsprong."},{status:403})
  const s=await createClient()
  const {data:{user}}=await s.auth.getUser()
  if(!user)return Response.json({error:"Aanmelden vereist."},{status:401})

  const parsed=removeSchema.safeParse(await request.json().catch(()=>null))
  if(!parsed.success)return Response.json({error:"Ongeldige push-subscriptie."},{status:400})

  const {error}=await s.rpc("upt_remove_push_subscription",{p_endpoint:parsed.data.endpoint})
  if(error){
    console.error("[Push] remove subscription",error.code)
    return Response.json({error:"Push-subscriptie verwijderen mislukt."},{status:500})
  }
  return Response.json({ok:true})
}
