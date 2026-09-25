import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-server'
import { AppLayout } from '@/components/layout/app-layout'
import { ReturnAfterLogin } from '@/components/auth/return-after-login'
export default async function AuthenticatedLayout({children}:{children:React.ReactNode}) {
 const s=await createClient()
 const {data:{user}}=await s.auth.getUser()
 if(!user) redirect('/login')
 const [{data:p,error},{data:passwordChangeRequired}]=await Promise.all([
  s.from('profiles').select('approved').eq('id',user.id).single(),
  s.rpc('upt_password_change_required'),
 ])
 if(error || !p) return <main className="p-8">Je profiel kon niet worden geladen. Probeer opnieuw.</main>
 if(passwordChangeRequired===true) redirect('/auth/reset-password?forced=1')
 if(!p.approved) return <main className="p-8">ACCOUNT NOG NIET GOEDGEKEURD</main>
 return <AppLayout><ReturnAfterLogin/>{children}</AppLayout>
}
