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

    if (!isValidEmailDomain(email)) {
        return { error: 'Registration is restricted to @yourcompany.com email addresses only.' }
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

    if (!email || !password) {
        return { error: 'Email and password are required.' }
    }

    if (!isValidEmailDomain(email)) {
        return { error: 'Access restricted to @yourcompany.com accounts.' }
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
        if (error.message.includes('Email not confirmed')) {
            return {
                error: 'Please verify your email address first. Check your inbox for the verification link.',
                code: 'email_not_confirmed',
            }
        }
        if (error.message.includes('Invalid login credentials')) {
            return { error: 'Incorrect email or password. Please try again.' }
        }
        return { error: error.message }
    }


    // Auto-recover missing user_profiles if standard trigger failed (common for manually imported users)
    let { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('is_active, gender')
        .eq('id', data.user.id)
        .single()

    if (!profile) {
        // Trigger failed: Create missing profile forcefully using service role
        const fName = email.split('@')[0].split('.').map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
        await supabaseAdmin.from('user_profiles').insert({
            id: data.user.id,
            email: email,
            full_name: fName,
            display_name: fName,
            is_active: true
        })

        const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'admin@yourcompany.com'
        // Force the app owner to be an administrator on first signup
        if (email === ADMIN_EMAIL) {
            await supabaseAdmin.from('user_roles').insert([
                { user_id: data.user.id, role: 'admin' },
            ])
        }

        // Act as if it succeeded
        profile = { is_active: true, gender: null }
    } else if (email === (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'admin@yourcompany.com')) {
        // Guarantee the admin is always active and has admin roles unconditionally
        await supabaseAdmin.from('user_profiles').update({ is_active: true }).eq('id', data.user.id)

        // Ensure roles exist
        const { data: currentRoles } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', data.user.id)
        const roleStrings = (currentRoles || []).map((r: any) => r.role)
        if (!roleStrings.includes('admin')) {
            await supabaseAdmin.from('user_roles').insert({ user_id: data.user.id, role: 'admin' })
        }
        profile.is_active = true
    }

    if (profile && !profile.is_active) {
        await supabase.auth.signOut()
        return {
            error: 'Your account has been disabled. Please contact your administrator.',
            code: 'account_disabled',
        }
    }

    // Provision standard leave balances for the current year if missing
    const currentYear = new Date().getFullYear()
    const { data: currentBalances } = await supabaseAdmin
        .from('leave_balances')
        .select('leave_type')
        .eq('user_id', data.user.id)
        .eq('year', currentYear)

    const existingTypes = (currentBalances || []).map(b => b.leave_type)
    const requiredBal = [
        { type: 'annual', total: 25 },
        { type: 'sick', total: 10 },
        { type: 'unpaid', total: 365 },
    ]

    // Maternity leave — female users only
    const gender = profile?.gender
    if (gender === 'female') {
        requiredBal.push({ type: 'maternity', total: 260 })
    }

    const missingBalances = requiredBal.filter(rb => !existingTypes.includes(rb.type as any))

    if (missingBalances.length > 0) {
        const inserts = missingBalances.map(mb => ({
            user_id: data.user.id,
            leave_type: mb.type as any,
            total: mb.total,
            year: currentYear
        }))
        await supabaseAdmin.from('leave_balances').insert(inserts)
    }

    const requestedPortal = ((formData.get('portal') as string) || 'staff').toLowerCase()
    const { data: loginRoles } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', data.user.id)
    const roles = new Set((loginRoles || []).map((r: any) => r.role))

    // The portal selector never grants privileges: it only selects which existing role is required.
    const allowed = requestedPortal === 'admin'
        ? roles.has('admin')
        : requestedPortal === 'responsible'
            ? (roles.has('responsible_lead') || roles.has('admin'))
            : (roles.has('employee') || roles.has('responsible_lead') || roles.has('admin'))

    if (!allowed) {
        await supabase.auth.signOut()
        return { error: `Dit account heeft geen toegang tot de ${requestedPortal} portal.`, code: 'wrong_portal' }
    }

    if (profile?.account_status && profile.account_status !== 'approved') {
        await supabase.auth.signOut()
        return { error: 'ACCOUNT NOT APPROVED', code: 'account_not_approved' }
    }

    await writeAuditLog({
        actorId: data.user.id,
        actorEmail: email,
        action: 'login',
        entityTable: 'auth.users',
        entityId: data.user.id,
        metadata: { portal: requestedPortal },
    })

    redirect(requestedPortal === 'admin' ? '/admin' : requestedPortal === 'responsible' ? '/operations' : '/')
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

    if (!isValidEmailDomain(email)) {
        return { error: 'Please enter your @yourcompany.com email address.' }
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

    if (!email || !isValidEmailDomain(email)) {
        return { error: 'Please enter a valid @yourcompany.com email address.' }
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
