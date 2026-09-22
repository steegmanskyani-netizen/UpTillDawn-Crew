// ============================================================
// Supabase Middleware — Refreshes auth sessions on every request
// Required for SSR auth to work correctly with Next.js App Router
// ============================================================

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
            getAll() {
                return request.cookies.getAll()
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) =>
                    request.cookies.set(name, value)
                )
                supabaseResponse = NextResponse.next({ request })
                cookiesToSet.forEach(({ name, value, options }) =>
                    supabaseResponse.cookies.set(name, value, options)
                )
            },
        },
    }
    )

    // Refresh the session (extends expiry if still valid)
    const { data: { user } } = await supabase.auth.getUser()

    // Protected routes — redirect to login if unauthenticated
    const protectedPaths = ['/dashboard', '/attendance', '/leave', '/calendar', '/visitors',
        '/reception', '/directory', '/diary', '/feedback', '/complaints', '/admin',
        '/settings', '/timesheets', '/corrections', '/manager',
        '/office', '/polls', '/notice-board', '/announcements', '/expenses',
        '/analytics', '/notifications', '/help', '/events', '/workplaces', '/shifts', '/operations', '/incidents', '/personnel', '/audit', '/briefings', '/tasks', '/chat', '/exports']

    const isProtected = request.nextUrl.pathname === '/' ||
        protectedPaths.some(p => request.nextUrl.pathname.startsWith(p))

    if (isProtected && !user) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        const response = NextResponse.redirect(url)
        supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie))
        return response
    }

    // If user is authenticated and tries to access auth pages (including /login/{portal}), redirect to dashboard
    const authPages = ['/login', '/signup', '/forgot-password']
    const isAuthPage = authPages.some(p =>
        request.nextUrl.pathname.startsWith(p)
    )

    if (isAuthPage && user) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        const response = NextResponse.redirect(url)
        supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie))
        return response
    }

    return supabaseResponse
}
