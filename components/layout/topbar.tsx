'use client'
import Link from 'next/link'
import { useDisplayName, useAuth } from '@/lib/providers'
import { signOut } from '@/lib/actions/auth'
export function Topbar(){
 const name=useDisplayName();const {roles}=useAuth()
 return <header className="flex min-h-16 items-center justify-between gap-3 border-b bg-card px-4">
 <Link href="/" className="font-black">Uptilldawn</Link>
 <div className="flex items-center gap-4 text-sm"><span className="hidden sm:inline">{name} · {roles.includes('admin')?'Admin':roles.includes('responsible_lead')?'Responsible':'Staff'}</span><Link href="/notifications">Meldingen</Link><Link href="/settings">Profiel</Link><form action={signOut}><button className="rounded-lg border p-2">Uitloggen</button></form></div></header>
}
