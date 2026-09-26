// ============================================================
// Auth Actions — Server Actions (App Router)
// All domain validation and session logic lives here.
// These run SERVER-SIDE only — never expose to client directly.
// ============================================================

'use server'

import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/crew-server'

function extractName(email: string): string {
    const local = email.split('@')[0]
    return local.split('.').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ').slice(0, 200)
}

function appOrigin(): string | null {
    const raw = process.env.NEXT_PUBLIC_APP_URL
    if (!raw) return null
    try {
        const url = new URL(raw)
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
    } catch { return null }
}

async function requestSecurityContext() {
    const h = await headers()
    const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim()
    const ip = h.get('cf-connecting-ip') || forwarded || h.get('x-real-ip') || null
    const city = h.get('cf-ipcity')
    const region = h.get('cf-region')
    const country = h.get('cf-ipcountry')
    const approximateLocation = [city, region, country].filter(Boolean).join(', ') || null
    return { ip, approximateLocation, userAgent: h.get('user-agent') }
}

// ── Sign Up ──────────────────────────────────────────────────
export async function signUp(formData: FormData) {
    const email = String(formData.get('email') || '').trim().toLowerCase()
    const password = String(formData.get('password') || '')
    const confirmPassword = String(formData.get('confirm_password') || '')
    const fullName = String(formData.get('full_name') || '').trim() || extractName(email)
    if (!email || !password) return { error: 'E-mail en wachtwoord zijn verplicht.' }
    if (!fullName || fullName.length > 200) return { error: 'Volledige naam moet tussen 1 en 200 tekens bevatten.' }
    if (password.length < 8) return { error: 'Wachtwoord moet minstens 8 tekens bevatten.' }
    if (confirmPassword && password !== confirmPassword) return { error: 'Wachtwoorden komen niet overeen.' }
    const origin = appOrigin()
    if (!origin) return { error: 'De applicatieconfiguratie is onvolledig. Neem contact op met de beheerder.' }
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/callback`, data: { full_name: fullName, pwa_install_prompt_pending: true } } })
    if (error) {
        if (error.message.includes('already registered')) return { error: 'Er bestaat al een account met dit e-mailadres. Log in.' }
        return { error: 'De aanvraag kon niet worden verwerkt. Probeer opnieuw.' }
    }
    return { success: true, message: `Controleer ${email} voor de verificatielink voordat je inlogt.`, userId: data.user?.id }
}

// ── Sign In ──────────────────────────────────────────────────
export async function signIn(formData: FormData) {
    const email = String(formData.get('email') || '').trim().toLowerCase()
    const password = String(formData.get('password') || '')
    const requestedPortal = String(formData.get('portal') || 'staff').toLowerCase()
    if (!['staff', 'responsible', 'admin'].includes(requestedPortal)) return { error: 'Ongeldig inlogportaal.', code: 'invalid_portal' }
    if (!email || !password) return { error: 'E-mail en wachtwoord zijn verplicht.' }

    const supabase = await createClient()
    const security = requestedPortal === 'admin' ? await requestSecurityContext() : null
    if (requestedPortal === 'admin') {
        const { data: guard, error: guardError } = await supabase.rpc('upt_admin_login_guard', { p_login: email })
        if (guardError) return { error: 'Aanmelden tijdelijk niet beschikbaar. Probeer opnieuw.', code: 'security_guard_error' }
        if (guard && guard.allowed === false) return { error: 'Te veel mislukte aanmeldpogingen. Probeer over 15 minuten opnieuw.', code: 'login_locked' }
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
        if (requestedPortal === 'admin') {
            await supabase.rpc('upt_admin_login_failure', { p_login: email, p_ip: security?.ip, p_location: security?.approximateLocation, p_user_agent: security?.userAgent })
        }
        if (error?.message.includes('Email not confirmed')) return { error: 'Verifieer eerst je e-mailadres.', code: 'email_not_confirmed' }
        if (error?.message.includes('Invalid login credentials')) return { error: 'Onjuist e-mailadres of wachtwoord.', code: 'invalid_credentials' }
        return { error: 'Aanmelden mislukt. Probeer opnieuw.' }
    }

    const { data: profile, error: profileError } = await supabase.from('profiles').select('approved, role').eq('id', data.user.id).single()
    if (profileError || !profile) { await supabase.auth.signOut(); return { error: 'Je profiel kon niet worden geladen. Probeer opnieuw.', code: 'profile_error' } }
    const { data: isOwner } = await supabase.rpc('upt_current_is_owner')
    if (!profile.approved && !isOwner) { await supabase.auth.signOut(); return { error: 'ACCOUNT NOG NIET GOEDGEKEURD', code: 'account_not_approved' } }

    const role = profile.role
    const hasPermanentAdminAccess = role === 'admin' || isOwner === true
    const allowed = requestedPortal === 'admin' ? hasPermanentAdminAccess : requestedPortal === 'responsible' ? role === 'responsible_lead' || hasPermanentAdminAccess : role === 'staff' || role === 'responsible_lead' || hasPermanentAdminAccess
    if (!allowed) {
        if (requestedPortal === 'admin') await supabase.rpc('upt_admin_login_failure', { p_login: email, p_ip: security?.ip, p_location: security?.approximateLocation, p_user_agent: security?.userAgent })
        await supabase.auth.signOut()
        return { error: 'Dit account heeft geen toegang tot het gekozen portaal.', code: 'wrong_portal' }
    }

    if (hasPermanentAdminAccess) {
        const requestedRoleMode = requestedPortal === 'admin' ? 'admin' : requestedPortal === 'responsible' ? 'responsible_lead' : 'staff'
        const { data: roleMode, error: roleModeError } = await supabase.rpc('upt_set_admin_role_mode', { p_role: requestedRoleMode })
        if (roleModeError || roleMode !== requestedRoleMode) { await supabase.auth.signOut(); return { error: 'De gekozen rolweergave kon niet worden geactiveerd.', code: 'role_mode_error' } }
    }

    if (requestedPortal === 'admin') await supabase.rpc('upt_admin_login_success', { p_login: email, p_ip: security?.ip, p_location: security?.approximateLocation, p_user_agent: security?.userAgent })
    redirect(requestedPortal === 'admin' ? '/admin' : '/')
}

// ── Sign Out ─────────────────────────────────────────────────
export async function signOut() {
    const supabase = await createClient(); await supabase.auth.signOut()
    const cookieStore = await cookies(); cookieStore.delete('uptilldawn-admin-edit-mode'); cookieStore.delete('uptilldawn-admin-edit-role'); redirect('/login')
}

// ── Forgot Password ──────────────────────────────────────────
export async function forgotPassword(formData: FormData) {
    const email = String(formData.get('email') || '').trim().toLowerCase(); if (!email) return { error: 'Vul je e-mailadres in.' }
    const origin = appOrigin(); if (!origin) return { error: 'De applicatieconfiguratie is onvolledig. Neem contact op met de beheerder.' }
    const supabase = await createClient(); const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/auth/reset-password` })
    if (error) return { error: 'De aanvraag kon niet worden verwerkt. Probeer opnieuw.' }
    return { success: true, message: 'Als dit account bestaat, is een herstel-link naar het e-mailadres verstuurd.' }
}

// ── Update Password ──────────────────────────────────────────
export async function updatePassword(formData: FormData) {
    const password = String(formData.get('password') || ''); const confirmPassword = String(formData.get('confirm_password') || '')
    if (password !== confirmPassword) return { error: 'Wachtwoorden komen niet overeen.' }
    if (password.length < 8) return { error: 'Wachtwoord moet minstens 8 tekens bevatten.' }
    const supabase = await createClient(); const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: 'De herstel-link is ongeldig of verlopen. Vraag een nieuwe herstel-link aan.' }
    const { error } = await supabase.auth.updateUser({ password }); if (error) return { error: 'De aanvraag kon niet worden verwerkt. Probeer opnieuw.' }
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' }); if (signOutError) await supabase.auth.signOut({ scope: 'local' })
    const cookieStore = await cookies(); cookieStore.delete('uptilldawn-admin-edit-mode'); cookieStore.delete('uptilldawn-admin-edit-role')
    return { success: true, message: 'Wachtwoord is bijgewerkt. Log opnieuw in.' }
}

// ── Resend Verification Email ────────────────────────────────
export async function resendVerificationEmail(formData: FormData) {
    const email = String(formData.get('email') || '').trim().toLowerCase(); if (!email) return { error: 'Vul je e-mailadres in.' }
    const origin = appOrigin(); if (!origin) return { error: 'De applicatieconfiguratie is onvolledig. Neem contact op met de beheerder.' }
    const supabase = await createClient(); const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${origin}/auth/callback` } })
    if (error) return { error: 'De verificatiemail kon niet worden verstuurd. Probeer opnieuw.' }
    return { success: true, message: 'Verificatiemail opnieuw verstuurd.' }
}
