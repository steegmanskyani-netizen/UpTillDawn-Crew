import { createClient } from "@/lib/supabase/crew-server"
import { fetchFacebookEventInfo } from "@/lib/facebook-event"

export const runtime="nodejs"

export async function GET(request:Request){
  const s=await createClient()
  const {data:{user}}=await s.auth.getUser()
  if(!user)return Response.json({error:"Aanmelden vereist."},{status:401})
  const [{data:approved},{data:isAdmin}]=await Promise.all([
    s.rpc("upt_is_approved"),
    s.rpc("upt_is_admin",{uid:user.id}),
  ])
  if(!approved||!isAdmin)return Response.json({error:"Geen toegang."},{status:403})

  const url=new URL(request.url).searchParams.get("url")?.trim()||""
  try{
    const event=await fetchFacebookEventInfo(url)
    return Response.json({event})
  }catch(error){
    return Response.json({
      error:error instanceof Error?error.message:"Facebook-evenement kon niet worden geïmporteerd.",
    },{status:422})
  }
}
