'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-server'

const GOD_COOKIE='uptilldawn-god-session'

export async function configureGodMode(formData:FormData){
  const login=String(formData.get('login')||'').trim().toLowerCase()
  const password=String(formData.get('password')||'')
  const confirm=String(formData.get('confirm_password')||'')
  if(login!=='edit@uptilldown')return {error:'God Mode login moet edit@uptilldown zijn.'}
  if(password.length<10)return {error:'God Mode wachtwoord moet minstens 10 tekens bevatten.'}
  if(password!==confirm)return {error:'Wachtwoorden komen niet overeen.'}

  const s=await createClient()
  const {data:{user}}=await s.auth.getUser()
  if(!user)return {error:'Meld eerst aan als maker van de app.'}
  const {data:isOwner}=await s.rpc('upt_current_is_owner')
  if(isOwner!==true)return {error:'Alleen de maker kan God Mode configureren.'}

  const {error}=await s.rpc('upt_god_set_credentials',{p_login:login,p_password:password})
  if(error){
    console.error('[God Mode] Setup failed',{code:error.code})
    return {error:'God Mode kon niet worden geconfigureerd.'}
  }

  const {data:token,error:loginError}=await s.rpc('upt_god_login',{p_login:login,p_password:password})
  if(loginError||!token)return {error:'God Mode werd opgeslagen maar de nieuwe sessie kon niet starten.'}

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
