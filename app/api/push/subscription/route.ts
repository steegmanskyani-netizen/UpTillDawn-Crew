import { z } from "zod"
import { createClient } from "@/lib/supabase/crew-server"

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

const subscriptionSchema=z.object({
  endpoint:z.string().url().max(4096).refine(safePushEndpoint),
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
