// ============================================================
// Auth Actions — Server Actions (App Router)
// All domain validation and session logic lives here.
// These run SERVER-SIDE only — never expose to client directly.
// ============================================================

'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/crew-server'

function extractName(email: string): string {
    const local = email.split('@')[0]
    return local
        .split('.')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
        .slice(0, 200)
}

function appOrigin(): string | null {
    const raw = process.env.NEXT_PUBLIC_APP_URL
    if (!raw) return null
    try {
        const url = new URL(raw)
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
    } catch {
        return null
    }
}

// ── Sign Up ──────────────────────────────────────────────────

export async function signUp(formData: FormData) {
    const email = String(formData.get('email') || '').trim().toLowerCase()
    const password = String(formData.get('password') || '')
    const confirmPassword = String(formData.get('confirm_password') || '')
    const fullName = String(formData.get('full_name') || '').trim() || extractName(email)

    if (!email || !password) {
        return { error: 'E-mail en wachtwoord zijn verplicht.' }
    }
    if (!fullName || fullName.length > 200) {
        return { error: 'Volledige naam moet tussen 1 en 200 tekens bevatten.' }
    }
    if (password.length < 8) {
        return { error: 'Wachtwoord moet minstens 8 tekens bevatten.' }
    }
    if (confirmPassword && password !== confirmPassword) {
        return { error: 'Wachtwoorden komen niet overeen.' }
    }

    const origin = appOrigin()
    if (!origin) {
        console.error('[Auth] NEXT_PUBLIC_APP_URL is missing or invalid')
        return { error: 'De applicatieconfiguratie is onvolledig. Neem contact op met de beheerder.' }
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${origin}/auth/callback`,
            data: {
                full_name: fullName,
            },
        },
    })

    if (error) {
        if (error.message.includes('already registered')) {
            return { error: 'Er bestaat al een account met dit e-mailadres. Log in.' }
        }
        console.error('[Auth]', { code: error.code, status: error.status })
        return { error: 'De aanvraag kon niet worden verwerkt. Probeer opnieuw.' }
    }

    return {
        success: true,
        message: `Controleer ${email} voor de verificatielink voordat je inlogt.`,
        userId: data.user?.id,
    }
}

// ── Sign In ──────────────────────────────────────────────────

export async function signIn(formData: FormData) {
    const email = String(formData.get('email') || '').trim().toLowerCase()
    const password = String(formData.get('password') || '')
    const requestedPortal = String(formData.get('portal') || 'staff').toLowerCase()

    if (!['staff', 'responsible', 'admin'].includes(requestedPortal)) {
        return { error: 'Ongeldig inlogportaal.', code: 'invalid_portal' }
    }

    if (!email || !password) {
        return { error: 'E-mail en wachtwoord zijn verplicht.' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error || !data.user) {
        if (error?.message.includes('Email not confirmed')) {
            return {
                error: 'Verifieer eerst je e-mailadres.',
                code: 'email_not_confirmed',
            }
        }

        if (error?.message.includes('Invalid login credentials')) {
            return {
                error: 'Onjuist e-mailadres of wachtwoord.',
                code: 'invalid_credentials',
            }
        }

        return { error: 'Aanmelden mislukt. Probeer opnieuw.' }
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('approved, role')
        .eq('id', data.user.id)
        .single()

    if (profileError || !profile) {
        console.error('[Auth] Profile lookup failed', { code: profileError?.code })
        await supabase.auth.signOut()
        return {
            error: 'Je profiel kon niet worden geladen. Probeer opnieuw.',
            code: 'profile_error',
        }
    }

    if (!profile.approved) {
        await supabase.auth.signOut()
        return {
            error: 'ACCOUNT NOG NIET GOEDGEKEURD',
            code: 'account_not_approved',
        }
    }

    const role = profile.role

    const allowed =
        requestedPortal === 'admin'
            ? role === 'admin'
            : requestedPortal === 'responsible'
                ? role === 'responsible_lead' || role === 'admin'
                : role === 'staff' ||
                  role === 'responsible_lead' ||
                  role === 'admin'

    if (!allowed) {
        await supabase.auth.signOut()
        return {
            error: `Dit account heeft geen toegang tot het gekozen portaal.`,
            code: 'wrong_portal',
        }
    }

    redirect(
        requestedPortal === 'admin'
            ? '/admin'
            : requestedPortal === 'responsible'
                ? '/operations'
                : '/'
    )
}

// ── Sign Out ─────────────────────────────────────────────────

export async function signOut() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
}

// ── Forgot Password ──────────────────────────────────────────

export async function forgotPassword(formData: FormData) {
    const email = (formData.get('email') as string)?.trim().toLowerCase()

    if (!email) {
        return { error: 'Vul je e-mailadres in.' }
    }


    const origin = appOrigin()
    if (!origin) {
        console.error('[Auth] NEXT_PUBLIC_APP_URL is missing or invalid')
        return { error: 'De applicatieconfiguratie is onvolledig. Neem contact op met de beheerder.' }
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
    })

    if (error) {
        console.error('[Auth]', { code: error.code, status: error.status })
        return { error: 'De aanvraag kon niet worden verwerkt. Probeer opnieuw.' }
    }

    return {
        success: true,
        message: 'Als dit account bestaat, is een herstel-link naar het e-mailadres verstuurd.',
    }
}

// ── Update Password ──────────────────────────────────────────

export async function updatePassword(formData: FormData) {
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirm_password') as string

    if (password !== confirmPassword) {
        return { error: 'Wachtwoorden komen niet overeen.' }
    }

    if (password.length < 8) {
        return { error: 'Wachtwoord moet minstens 8 tekens bevatten.' }
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
        console.error('[Auth]', { code: error.code, status: error.status })
        return { error: 'De aanvraag kon niet worden verwerkt. Probeer opnieuw.' }
    }

    return { success: true, message: 'Wachtwoord is bijgewerkt.' }
}

// ── Resend Verification Email ─────────────────────────────────

export async function resendVerificationEmail(formData: FormData) {
    const email = (formData.get('email') as string)?.trim().toLowerCase()

    if (!email) {
        return { error: 'Vul je e-mailadres in.' }
    }

    const origin = appOrigin()
    if (!origin) {
        console.error('[Auth] NEXT_PUBLIC_APP_URL is missing or invalid')
        return { error: 'De applicatieconfiguratie is onvolledig. Neem contact op met de beheerder.' }
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${origin}/auth/callback` },
    })

    if (error) {
        console.error('[Auth]', { code: error.code, status: error.status })
        return { error: 'De aanvraag kon niet worden verwerkt. Probeer opnieuw.' }
    }

    return { success: true, message: 'Verificatiemail opnieuw verstuurd. Controleer je inbox.' }
}

// ── Get Current User with Profile ────────────────────────────

export async function getCurrentUser() {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return null

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('id,full_name,phone_number,profile_photo_url,approved,role')
        .eq('id', user.id)
        .single()
    if (error || !profile || !profile.approved) return null
    const realRole = profile.role
    const cookieStore = await cookies()
    const testMode = realRole === 'admin' && cookieStore.get('uptilldawn-admin-test-mode')?.value === '1'
    const requestedTestRole = cookieStore.get('uptilldawn-admin-test-role')?.value
    const effectiveRole = testMode
        ? requestedTestRole === 'responsible_lead' ? 'responsible_lead' : 'staff'
        : realRole
    const roles = [effectiveRole === 'staff' ? 'employee' : effectiveRole]
    return {
        ...profile,
        role: effectiveRole,
        realRole,
        id: user.id,
        email: user.email ?? '',
        roles,
        isAdmin: realRole === 'admin' && !testMode,
        realIsAdmin: realRole === 'admin',
        isTestMode: testMode,
    }
}
