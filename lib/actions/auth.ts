// ============================================================
// Auth Actions — Server Actions (App Router)
// All domain validation and session logic lives here.
// These run SERVER-SIDE only — never expose to client directly.
// ============================================================

'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-server'

function extractName(email: string): string {
    const local = email.split('@')[0]
    return local
        .split('.')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

// ── Sign Up ──────────────────────────────────────────────────

export async function signUp(formData: FormData) {
    const email = (formData.get('email') as string)?.trim().toLowerCase()
    const password = formData.get('password') as string
    const fullName = (formData.get('full_name') as string)?.trim() || extractName(email || '')

    if (!email || !password) {
        return { error: 'Email and password are required.' }
    }


    if (password.length < 8) {
        return { error: 'Password must be at least 8 characters.' }
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL

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
            return { error: 'An account with this email already exists. Please sign in.' }
        }
        console.error('[Auth]', { code: error.code, status: error.status })
        return { error: 'De aanvraag kon niet worden verwerkt. Probeer opnieuw.' }
    }

    return {
        success: true,
        message: `Check your email (${email}) for a verification link before signing in.`,
        userId: data.user?.id,
    }
}

// ── Sign In ──────────────────────────────────────────────────

export async function signIn(formData: FormData) {
    const email = (formData.get('email') as string)?.trim().toLowerCase()
    const password = formData.get('password') as string
    const requestedPortal = ((formData.get('portal') as string) || 'staff').toLowerCase()

    if (!email || !password) {
        return { error: 'Email and password are required.' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error || !data.user) {
        if (error?.message.includes('Email not confirmed')) {
            return {
                error: 'Please verify your email address first.',
                code: 'email_not_confirmed',
            }
        }

        if (error?.message.includes('Invalid login credentials')) {
            return {
                error: 'Incorrect email or password. Please try again.',
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
            error: 'ACCOUNT NOT APPROVED',
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
                  role === 'employee' ||
                  role === 'responsible_lead' ||
                  role === 'admin'

    if (!allowed) {
        await supabase.auth.signOut()
        return {
            error: `Dit account heeft geen toegang tot de ${requestedPortal} portal.`,
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
        return { error: 'Please enter your email address.' }
    }


    const origin = process.env.NEXT_PUBLIC_APP_URL

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
        message: 'If that account exists, a reset link has been sent to your email.',
    }
}

// ── Update Password ──────────────────────────────────────────

export async function updatePassword(formData: FormData) {
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirm_password') as string

    if (password !== confirmPassword) {
        return { error: 'Passwords do not match.' }
    }

    if (password.length < 8) {
        return { error: 'Password must be at least 8 characters.' }
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
        console.error('[Auth]', { code: error.code, status: error.status })
        return { error: 'De aanvraag kon niet worden verwerkt. Probeer opnieuw.' }
    }

    return { success: true, message: 'Password updated successfully.' }
}

// ── Resend Verification Email ─────────────────────────────────

export async function resendVerificationEmail(formData: FormData) {
    const email = (formData.get('email') as string)?.trim().toLowerCase()

    if (!email) {
        return { error: 'Please enter your email address.' }
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL

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

    return { success: true, message: 'Verification email resent. Please check your inbox.' }
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
    // Compatibility fields for legacy components; authorization uses profiles.role.
    const roles = [profile.role === 'staff' ? 'employee' : profile.role]
    return {
        ...profile, id: user.id, email: user.email ?? '', roles,
        display_name: profile.full_name, avatar_url: profile.profile_photo_url,
        department: null, location: null, department_id: null, location_id: null,
        is_active: profile.approved, job_title: null, desk_extension: null,
        isAdmin: profile.role === 'admin', isDirector: false,
        isAccounts: false, isReception: false,
    }
}
