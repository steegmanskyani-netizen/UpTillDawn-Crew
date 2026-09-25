import { getCloudflareContext } from "@opennextjs/cloudflare"
import { z } from "zod"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/crew-server"

export const runtime = "nodejs"

const conditionSchema=z.enum([
  "always",
  "assigned_event",
  "assigned_workplace_role",
  "event_active",
  "shift_active",
  "never",
])

const requestSchema=z.object({
  message:z.string().trim().min(1).max(4000),
  role:z.enum(["staff","responsible_lead","admin"]),
  path:z.string().max(300),
  rules:z.array(z.object({
    role:z.string(),
    feature_key:z.string().min(1).max(100),
    label:z.string().max(80),
    group_key:z.string().max(100),
    visible:z.boolean(),
    enabled:z.boolean(),
    condition_key:conditionSchema,
    sort_order:z.number(),
    settings:z.unknown().optional(),
  })).max(60),
})

const aiPatchSchema=z.object({
  feature_key:z.string().min(1).max(100),
  label:z.string().max(80).nullable(),
  visible:z.boolean().nullable(),
  enabled:z.boolean().nullable(),
  condition_key:conditionSchema.nullable(),
  sort_order:z.number().int().nullable(),
})

const aiResultSchema=z.object({
  answer:z.string().max(4000),
  patches:z.array(aiPatchSchema).max(60),
})

const outputSchema={
  type:"object",
  additionalProperties:false,
  properties:{
    answer:{type:"string"},
    patches:{
      type:"array",
      items:{
        type:"object",
        additionalProperties:false,
        properties:{
          feature_key:{type:"string"},
          label:{anyOf:[{type:"string"},{type:"null"}]},
          visible:{anyOf:[{type:"boolean"},{type:"null"}]},
          enabled:{anyOf:[{type:"boolean"},{type:"null"}]},
          condition_key:{anyOf:[
            {type:"string",enum:["always","assigned_event","assigned_workplace_role","event_active","shift_active","never"]},
            {type:"null"},
          ]},
          sort_order:{anyOf:[{type:"integer"},{type:"null"}]},
        },
        required:["feature_key","label","visible","enabled","condition_key","sort_order"],
      },
    },
  },
  required:["answer","patches"],
} as const

type WorkersAiBinding={
  run:(model:string,input:Record<string,unknown>)=>Promise<unknown>
}

type AiResult=z.infer<typeof aiResultSchema>

function crossSite(request:Request){
  const fetchSite=request.headers.get("sec-fetch-site")
  if(fetchSite==="cross-site")return true
  const origin=request.headers.get("origin")
  return Boolean(origin&&origin!==new URL(request.url).origin)
}

function normalizeAiResult(payload:unknown):AiResult|null{
  if(!payload||typeof payload!=="object")return null
  const response=(payload as {response?:unknown}).response
  let parsed:unknown=response
  if(typeof response==="string"){
    try{parsed=JSON.parse(response)}catch{return null}
  }
  if(!parsed||typeof parsed!=="object")return null
  const result=aiResultSchema.safeParse(parsed)
  return result.success?result.data:null
}

export async function POST(request:Request){
  if(crossSite(request))return Response.json({error:"Ongeldige oorsprong."},{status:403})

  const supabase=await createClient()
  const {data:{user}}=await supabase.auth.getUser()
  let authorized=false
  if(user){
    const {data:isOwner}=await supabase.rpc("upt_current_is_owner")
    authorized=isOwner===true
  }
  if(!authorized){
    const token=(await cookies()).get("uptilldawn-god-session")?.value
    if(token){
      const {data:valid}=await supabase.rpc("upt_god_session_valid",{p_token:token})
      authorized=valid===true
    }
  }
  if(!authorized)return Response.json({error:"God Mode sessie vereist."},{status:403})

  const parsed=requestSchema.safeParse(await request.json().catch(()=>null))
  if(!parsed.success)return Response.json({error:"Ongeldige AI-aanvraag."},{status:400})

  let ai:WorkersAiBinding|undefined
  try{
    const {env}=getCloudflareContext()
    ai=(env as {AI?:WorkersAiBinding}).AI
  }catch(error){
    console.error("[Edit assistant] Cloudflare context unavailable",{
      message:error instanceof Error?error.message:"unknown",
    })
  }

  if(!ai){
    return Response.json({
      error:"Gratis AI is nog niet beschikbaar op deze deployment.",
      configured:false,
    },{status:503})
  }

  const input=parsed.data
  const system=[
    "Je bent de ingebouwde Up Till Dawn AI app-editor.",
    "Antwoord in het Nederlands tenzij de gebruiker expliciet een andere taal vraagt.",
    "Je krijgt de huidige pagina, previewrol en de actuele role_ui_rules.",
    "Voor wijzigingen die met de huidige Edit mode uitvoerbaar zijn, vul patches in.",
    "Gebruik alleen bestaande feature_key-waarden uit de aangeleverde rules.",
    "Gebruik null voor velden die niet moeten wijzigen.",
    "sort_order mag worden gebruikt om navigatievolgorde te veranderen; lagere waarden komen eerst.",
    "Leg kort uit wat je voorstelt.",
    "Broncode, database-schema en GitHub-commits kun je in deze interface alleen bespreken; voer daarvoor geen verzonnen wijzigingen uit.",
  ].join("\n")

  try{
    const raw=await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",{
      messages:[
        {role:"system",content:system},
        {role:"user",content:JSON.stringify({
          request:input.message,
          current_path:input.path,
          editing_role:input.role,
          editable_rules:input.rules,
        })},
      ],
      response_format:{
        type:"json_schema",
        json_schema:outputSchema,
      },
      max_tokens:700,
      temperature:0.1,
    })

    const result=normalizeAiResult(raw)
    if(!result){
      console.error("[Edit assistant] Workers AI returned an invalid structured result")
      return Response.json({error:"De gratis AI gaf geen bruikbaar gestructureerd antwoord."},{status:502})
    }

    const allowedKeys=new Set(input.rules.map(rule=>rule.feature_key))
    return Response.json({
      answer:result.answer,
      patches:result.patches.filter(patch=>allowedKeys.has(patch.feature_key)),
      configured:true,
      provider:"cloudflare-workers-ai",
    })
  }catch(error){
    const message=error instanceof Error?error.message:"unknown"
    console.error("[Edit assistant] Workers AI request failed",{message})
    const quota=/neuron|quota|limit|capacity|429|3040/i.test(message)
    return Response.json({
      error:quota
        ?"De gratis AI-daglimiet of capaciteit is tijdelijk bereikt. Probeer later opnieuw; de gratis limiet wordt dagelijks vernieuwd."
        :"De gratis AI kon de aanvraag niet verwerken. Probeer opnieuw.",
    },{status:quota?429:502})
  }
}
