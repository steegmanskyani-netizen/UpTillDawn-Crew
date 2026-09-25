import { z } from "zod"
import { authorizeStudio, studioFailure, studioResponse } from "@/lib/god-studio-server"
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


export async function GET(request:Request){
  try{
    const {client,token}=await authorizeStudio(request)
    const requested=role.safeParse(new URL(request.url).searchParams.get("role"))
    if(!requested.success)return studioResponse({error:"Ongeldige rol."},400)
    const {data,error}=await client.rpc("upt_god_role_rules",{p_token:token,p_role:requested.data})
    if(error)return studioResponse({error:"God Mode sessie is verlopen."},401)
    return studioResponse({rules:data||[]})
  }catch(error){return studioFailure(error)}
}

export async function POST(request:Request){
  try{
    const {client,token}=await authorizeStudio(request)
    const body=z.object({role,rules:z.array(rule).max(60)}).safeParse(await request.json().catch(()=>null))
    if(!body.success)return studioResponse({error:"Ongeldige editorgegevens."},400)
    const normalized=body.data.rules.map((item,index)=>({
      ...item,
      role:body.data.role,
      sort_order:(index+1)*10,
    }))
    const {error}=await client.rpc("upt_god_save_role_rules",{
      p_token:token,
      p_role:body.data.role,
      p_rules:normalized,
    })
    if(error){
      console.error("[God Mode] Save failed",{code:error.code})
      return studioResponse({error:"God Mode kon de rolregels niet opslaan."},403)
    }
    return studioResponse({ok:true,rules:normalized})
  }catch(error){return studioFailure(error)}
}
