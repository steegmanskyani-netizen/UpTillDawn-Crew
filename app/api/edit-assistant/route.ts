import { z } from "zod"
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

function responseText(payload:unknown):string|null{
  if(!payload||typeof payload!=="object")return null
  const root=payload as {output_text?:unknown;output?:unknown}
  if(typeof root.output_text==="string")return root.output_text
  if(!Array.isArray(root.output))return null
  for(const item of root.output){
    if(!item||typeof item!=="object")continue
    const content=(item as {content?:unknown}).content
    if(!Array.isArray(content))continue
    for(const part of content){
      if(!part||typeof part!=="object")continue
      const typed=part as {type?:unknown;text?:unknown}
      if(typed.type==="output_text"&&typeof typed.text==="string")return typed.text
    }
  }
  return null
}

export async function POST(request:Request){
  const supabase=await createClient()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)return Response.json({error:"Aanmelden vereist."},{status:401})

  const {data:isOwner}=await supabase.rpc("upt_current_is_owner")
  if(isOwner!==true)return Response.json({error:"Deze AI-editor is alleen beschikbaar voor de maker van de app."},{status:403})

  const parsed=requestSchema.safeParse(await request.json().catch(()=>null))
  if(!parsed.success)return Response.json({error:"Ongeldige ChatGPT-aanvraag."},{status:400})

  const apiKey=process.env.OPENAI_API_KEY?.trim()
  if(!apiKey){
    return Response.json({
      error:"ChatGPT is nog niet geconfigureerd. Voeg OPENAI_API_KEY toe als server-side Cloudflare secret.",
      configured:false,
    },{status:503})
  }

  const model=process.env.OPENAI_MODEL?.trim()||"gpt-6-astra"
  const input=parsed.data

  const openAiResponse=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${apiKey}`,
      "Content-Type":"application/json",
    },
    body:JSON.stringify({
      model,
      instructions:[
        "Je bent de ingebouwde Up Till Dawn app-editor.",
        "Antwoord in het Nederlands tenzij de gebruiker expliciet een andere taal vraagt.",
        "Je krijgt de huidige pagina, previewrol en de actuele role_ui_rules.",
        "Voor wijzigingen die met de huidige Edit mode uitvoerbaar zijn, vul patches in.",
        "Gebruik alleen bestaande feature_key-waarden uit de aangeleverde rules.",
        "Gebruik null voor velden die niet moeten wijzigen.",
        "sort_order mag worden gebruikt om navigatievolgorde te veranderen; lagere waarden komen eerst.",
        "Leg kort uit wat je voorstelt.",
        "Broncode, database-schema en GitHub-commits kun je in deze interface alleen bespreken; voer daarvoor geen verzonnen wijzigingen uit.",
      ].join("\n"),
      input:JSON.stringify({
        request:input.message,
        current_path:input.path,
        editing_role:input.role,
        editable_rules:input.rules,
      }),
      text:{
        format:{
          type:"json_schema",
          name:"uptilldawn_edit_assistant",
          strict:true,
          schema:outputSchema,
        },
      },
    }),
  })

  if(!openAiResponse.ok){
    console.error("[Edit assistant] OpenAI request failed",{status:openAiResponse.status})
    return Response.json({error:"ChatGPT kon de aanvraag niet verwerken."},{status:502})
  }

  const raw=await openAiResponse.json()
  const text=responseText(raw)
  if(!text)return Response.json({error:"ChatGPT gaf geen bruikbaar antwoord."},{status:502})

  try{
    const result=JSON.parse(text) as {answer?:unknown;patches?:unknown}
    if(typeof result.answer!=="string"||!Array.isArray(result.patches))throw new Error("invalid")
    return Response.json({answer:result.answer,patches:result.patches,configured:true})
  }catch{
    return Response.json({error:"ChatGPT gaf een ongeldig gestructureerd antwoord."},{status:502})
  }
}
