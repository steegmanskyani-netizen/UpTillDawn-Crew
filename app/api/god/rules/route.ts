import { cookies } from "next/headers"
import { z } from "zod"
import { createClient } from "@/lib/supabase/crew-server"
import type { Json } from "@/types/crew-database"

const role=z.enum(["staff","responsible_lead","admin"])
const condition=z.enum(["always","assigned_event","assigned_workplace_role","event_active","shift_active","never"])
const rule=z.object({
  role,
  feature_key:z.string().min(1).max(100),
  label:z.string().max(80),
  group_key:z.string().max(100),
  visible:z.boolean(),
  enabled:z.boolean(),
  condition_key:condition,
  sort_order:z.number().int(),
  settings:z.custom<Json>().optional(),
})

async function token(){
  return (await cookies()).get("uptilldawn-god-session")?.value||null
}

export async function GET(request:Request){
  const session=await token()
  if(!session)return Response.json({error:"God Mode sessie vereist."},{status:401})
  const requested=role.safeParse(new URL(request.url).searchParams.get("role"))
  if(!requested.success)return Response.json({error:"Ongeldige rol."},{status:400})
  const s=await createClient()
  const {data,error}=await s.rpc("upt_god_role_rules",{p_token:session,p_role:requested.data})
  if(error)return Response.json({error:"God Mode sessie is verlopen."},{status:401})
  return Response.json({rules:data||[]})
}

export async function POST(request:Request){
  const session=await token()
  if(!session)return Response.json({error:"God Mode sessie vereist."},{status:401})
  const body=z.object({role,rules:z.array(rule).max(60)}).safeParse(await request.json().catch(()=>null))
  if(!body.success)return Response.json({error:"Ongeldige editorgegevens."},{status:400})
  const normalized=body.data.rules.map((item,index)=>({
    ...item,
    role:body.data.role,
    sort_order:(index+1)*10,
  }))
  const s=await createClient()
  const {error}=await s.rpc("upt_god_save_role_rules",{
    p_token:session,
    p_role:body.data.role,
    p_rules:normalized,
  })
  if(error){
    console.error("[God Mode] Save failed",{code:error.code})
    return Response.json({error:"God Mode kon de rolregels niet opslaan."},{status:403})
  }
  return Response.json({ok:true,rules:normalized})
}
