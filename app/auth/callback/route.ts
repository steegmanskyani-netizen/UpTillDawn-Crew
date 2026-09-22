import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/crew-server'
export async function GET(request: NextRequest) {
 const params=request.nextUrl.searchParams
 const s=await createClient()
 const code=params.get('code'), hash=params.get('token_hash'), type=params.get('type')
 let error: unknown = params.get('error')
 if(!error && code) ({error}=await s.auth.exchangeCodeForSession(code))
 else if(!error && hash && (type==='email'||type==='recovery'||type==='signup')) ({error}=await s.auth.verifyOtp({token_hash:hash,type}))
 else error=true
 const requested=params.get('next') || '/'
 const safeNext=requested.startsWith('/') && !requested.startsWith('//') && !requested.includes('\\') ? requested : '/'
 const target=error ? '/verify-email?error=De%20link%20is%20ongeldig%20of%20verlopen.' : type==='recovery' ? '/auth/reset-password' : safeNext
 return NextResponse.redirect(new URL(target, request.nextUrl.origin))
}
