import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/crew-server"
import { autocompleteGeoapify } from "@/lib/geoapify"

export const dynamic="force-dynamic"

const WINDOW_MS=60_000
const MAX_REQUESTS=60
const buckets=new Map<string,{count:number;resetAt:number}>()

function allowRequest(userId:string){
  const now=Date.now()
  const current=buckets.get(userId)
  if(!current||current.resetAt<=now){
    buckets.set(userId,{count:1,resetAt:now+WINDOW_MS})
    return {allowed:true,retryAfter:0}
  }
  if(current.count>=MAX_REQUESTS){
    return {allowed:false,retryAfter:Math.max(1,Math.ceil((current.resetAt-now)/1000))}
  }
  current.count+=1
  return {allowed:true,retryAfter:0}
}

export async function GET(request:NextRequest){
  const s=await createClient()
  const {data:{user}}=await s.auth.getUser()
  if(!user)return NextResponse.json({error:"Aanmelden vereist."},{status:401})

  const [{data:isApproved},{data:isAdmin}]=await Promise.all([
    s.rpc("upt_is_approved"),
    s.rpc("upt_is_admin",{uid:user.id}),
  ])
  if(!isApproved||!isAdmin){
    return NextResponse.json({error:"Geen toegang."},{status:403})
  }

  const rate=allowRequest(user.id)
  if(!rate.allowed){
    return NextResponse.json(
      {error:"Te veel locatiezoekopdrachten. Probeer over enkele seconden opnieuw."},
      {status:429,headers:{"Retry-After":String(rate.retryAfter),"Cache-Control":"no-store"}},
    )
  }

  const query=(request.nextUrl.searchParams.get("q")||"").trim()
  const lang=(request.nextUrl.searchParams.get("lang")||"nl").slice(0,2).toLowerCase()
  if(query.length<2)return NextResponse.json({results:[]})
  if(query.length>200)return NextResponse.json({error:"Zoekopdracht is te lang."},{status:400})

  try{
    const results=await autocompleteGeoapify(query,lang,6)
    return NextResponse.json({results},{headers:{"Cache-Control":"no-store"}})
  }catch(error){
    const message=error instanceof Error?error.message:"Locaties konden niet worden opgezocht."
    const status=message.includes("nog niet geconfigureerd")?503:502
    return NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}})
  }
}
