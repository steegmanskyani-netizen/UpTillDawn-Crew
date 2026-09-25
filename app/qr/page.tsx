import {redirect} from 'next/navigation'
import {createClient} from '@/lib/supabase/crew-server'
import QrShiftRequest from '@/components/crew/qr-shift-request'

export const dynamic='force-dynamic'

export default async function QrEntryPage(){
 const s=await createClient()
 const {data:{user}}=await s.auth.getUser()
 if(!user)redirect('/login?next=/qr')
 const {data:profile}=await s.from('profiles').select('approved').eq('id',user.id).single()
 if(!profile?.approved)redirect('/unauthorized')
 return <QrShiftRequest/>
}
