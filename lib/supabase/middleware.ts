// ============================================================
// Supabase Middleware — Refreshes auth sessions on every request
// Required for SSR auth to work correctly with Next.js App Router
// ============================================================

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_EXACT_PATHS = new Set([
    '/login',
    '/signup',
    '/forgot-password',
    '/auth/reset-password',
    '/verify-email',
    '/disabled',
    '/unauthorized',
    '/manifest.webmanifest',
    '/robots.txt',
    '/sitemap.xml',
    '/icon.png',
])

const PUBLIC_PREFIXES = [
    '/login/',
    '/auth/callback',
    '/api/',
]

function isPublicPath(pathname: string) {
    return PUBLIC_EXACT_PATHS.has(pathname) ||
        PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

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
    })

    // Refresh and validate the session server-side.
    const { data: { user } } = await supabase.auth.getUser()
    const pathname = request.nextUrl.pathname

    // Application pages are private by default. API routes remain responsible
    // for their own authentication/authorization so public auth/support APIs
    // can continue to operate without being accidentally hidden by middleware.
    if (!isPublicPath(pathname) && !user) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.search = ''
        const response = NextResponse.redirect(url)
        supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie))
        return response
    }

    // Auth entry pages should not be shown to an already authenticated user.
    const authPages = ['/login', '/signup', '/forgot-password']
    const isAuthPage = authPages.some(path =>
        pathname === path || pathname.startsWith(`${path}/`)
    )

    if (isAuthPage && user) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        url.search = ''
        const response = NextResponse.redirect(url)
        supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie))
        return response
    }

    return supabaseResponse
}
