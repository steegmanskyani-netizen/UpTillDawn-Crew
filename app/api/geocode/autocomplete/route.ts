import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/crew-server"
import { autocompleteGeoapify } from "@/lib/geoapify"

export const dynamic="force-dynamic"

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

  const query=(request.nextUrl.searchParams.get("q")||"").trim()
  const lang=(request.nextUrl.searchParams.get("lang")||"nl").slice(0,2).toLowerCase()
  if(query.length<2)return NextResponse.json({results:[]})
  if(query.length>200)return NextResponse.json({error:"Zoekopdracht is te lang."},{status:400})

  try{
    const results=await autocompleteGeoapify(query,lang,6)
    return NextResponse.json({results})
  }catch(error){
    const message=error instanceof Error?error.message:"Locaties konden niet worden opgezocht."
    const status=message.includes("nog niet geconfigureerd")?503:502
    return NextResponse.json({error:message},{status})
  }
}
