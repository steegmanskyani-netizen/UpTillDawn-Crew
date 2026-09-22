// ============================================================
// Auth Actions — Server Actions (App Router)
// All domain validation and session logic lives here.
// These run SERVER-SIDE only — never expose to client directly.
// ============================================================

'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { headers } from 'next/headers'

const ALLOWED_DOMAIN = process.env.NEXT_AUTH_DOMAIN ?? '@yourcompany.com'

// Specific non-domain emails permitted to access the system.
// Populate with additional allowlisted addresses if needed.
const ALLOWED_EMAILS = new Set<string>([])

// ── Input validation ─────────────────────────────────────────

function isValidEmailDomain(email: string): boolean {
    const e = email.trim().toLowerCase()
    return e.endsWith(ALLOWED_DOMAIN) || ALLOWED_EMAILS.has(e)
}

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
    const fullName = (formData.get('full_name') as string)?.trim() || extractName(email)

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
        return { error: error.message }
    }

    // The handle_new_user() Postgres trigger fires automatically and:
    //   1. Creates the user_profiles row
    //   2. Assigns 'employee' role
    //   3. Auto-assigns 'admin' role if email matches NEXT_PUBLIC_ADMIN_EMAIL
    //   4. Seeds leave balances

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

        return { error: error?.message || 'Login failed.' }
    }

    const { data: profile, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .select('approved, role')
        .eq('id', data.user.id)
        .single()

    if (profileError || !profile) {
        console.error('UPTILLDAWN PROFILE ERROR:', profileError)
        await supabase.auth.signOut()
        return {
            error: profileError
                ? `PROFILE ERROR: ${profileError.message}`
                : 'PROFILE ERROR: profiel niet gevonden',
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

    await writeAuditLog({
        actorId: data.user.id,
        actorEmail: email,
        action: 'login',
        entityTable: 'auth.users',
        entityId: data.user.id,
        metadata: {
            portal: requestedPortal,
            role,
        },
    })

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
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
        await writeAuditLog({
            actorId: user.id,
            actorEmail: user.email,
            action: 'logout',
            entityTable: 'auth.users',
            entityId: user.id,
        })
    }

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
        redirectTo: `${origin}/auth/reset-password`,
    })

    if (error) {
        return { error: error.message }
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
        return { error: error.message }
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
        return { error: error.message }
    }

    return { success: true, message: 'Verification email resent. Please check your inbox.' }
}

// ── Get Current User with Profile ────────────────────────────

export async function getCurrentUser() {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return null

    const { data: profile } = await supabase
        .from('user_profiles')
        .select(`
      *,
      department:departments(id, name),
      location:locations(id, name)
    `)
        .eq('id', user.id)
        .single()

    const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)

    const roles = rolesData?.map(r => r.role) ?? ['employee']

    return {
        ...profile,
        id: user.id as string,
        email: (user.email ?? profile?.email ?? '') as string,
        roles,
        isAdmin: roles.includes('admin'),
        isDirector: roles.includes('director'),
        isAccounts: roles.includes('accounts'),
        isReception: roles.includes('reception'),
    }
}
