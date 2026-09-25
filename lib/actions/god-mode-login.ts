'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-server'

const SESSION_COOKIE = 'uptilldawn-god-session'

export async function signInGodMode(formData: FormData) {
  const login = String(formData.get('login') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')

  const supabase = await createClient()
  const { data: token, error } = await supabase.rpc('upt_god_login', {
    p_login: login,
    p_password: password,
  })

  if (error || !token) redirect('/god-mode/login?error=1')

  const store = await cookies()
  store.set(SESSION_COOKIE, String(token), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 2 * 60 * 60,
  })

  redirect('/god-mode')
}
