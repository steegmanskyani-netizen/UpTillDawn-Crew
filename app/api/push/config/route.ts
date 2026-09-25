import { createClient } from "@/lib/supabase/crew-server"

export const dynamic="force-dynamic"

export async function GET(){
  const s=await createClient()
  const {data:{user}}=await s.auth.getUser()
  if(!user)return Response.json({error:"Aanmelden vereist."},{status:401})

  const [{data:approved},{data:publicKey,error:keyError},{count,error:countError}]=await Promise.all([
    s.rpc("upt_is_approved"),
    s.rpc("upt_push_public_key"),
    s.from("crew_notifications").select("id",{count:"exact",head:true}).eq("user_id",user.id).is("read_at",null),
  ])
  if(!approved)return Response.json({error:"Account niet goedgekeurd."},{status:403})
  if(keyError||!publicKey)return Response.json({error:"Push is nog niet geconfigureerd."},{status:503})
  if(countError)console.error("[Push] unread count",countError.code)

  return Response.json({publicKey,unreadCount:count??0},{headers:{"cache-control":"no-store"}})
}
