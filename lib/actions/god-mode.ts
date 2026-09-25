'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-server'

const GOD_COOKIE='uptilldawn-god-session'

export async function configureGodMode(formData:FormData){
  const login=String(formData.get('login')||'').trim().toLowerCase()
  const password=String(formData.get('password')||'')
  const confirm=String(formData.get('confirm_password')||'')
  if(login!=='godmode@uptilldawn')throw new Error('God Mode login moet godmode@uptilldawn zijn.')
  if(password.length<10)throw new Error('God Mode wachtwoord moet minstens 10 tekens bevatten.')
  if(password!==confirm)throw new Error('Wachtwoorden komen niet overeen.')

  const s=await createClient()
  const {data:{user}}=await s.auth.getUser()
  if(!user)throw new Error('Meld eerst aan als maker van de app.')
  const {data:isOwner}=await s.rpc('upt_current_is_owner')
  if(isOwner!==true)throw new Error('Alleen de maker kan God Mode configureren.')

  const {error}=await s.rpc('upt_god_set_credentials',{p_login:login,p_password:password})
  if(error){
    console.error('[God Mode] Setup failed',{code:error.code})
    throw new Error('God Mode kon niet worden geconfigureerd.')
  }

  const {data:token,error:loginError}=await s.rpc('upt_god_login',{p_login:login,p_password:password})
  if(loginError||!token)throw new Error('God Mode werd opgeslagen maar de nieuwe sessie kon niet starten.')

  const store=await cookies()
  store.set(GOD_COOKIE,token,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:2*60*60})
  redirect('/god-mode')
}

export async function godModeLogout(){
  const store=await cookies()
  const token=store.get(GOD_COOKIE)?.value
  if(token){
    const s=await createClient()
    await s.rpc('upt_god_logout',{p_token:token})
  }
  store.delete(GOD_COOKIE)
  redirect('/login/admin')
}
