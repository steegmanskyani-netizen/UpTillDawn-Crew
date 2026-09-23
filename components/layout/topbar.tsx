'use client'
import Link from 'next/link'
import { useDisplayName, useAuth } from '@/lib/providers'
import { signOut } from '@/lib/actions/auth'

export function Topbar(){
 const name=useDisplayName()
 const {roles,isAdmin,testRole,setTestRole}=useAuth()
 const roleLabel=testRole==='employee'?'Employee (test)':testRole==='responsible_lead'?'Responsible (test)':roles.includes('admin')?'Admin':roles.includes('responsible_lead')?'Responsible':'Staff'
 return <>
  {isAdmin&&testRole&&<div className="flex items-center justify-center gap-3 bg-amber-500 px-3 py-2 text-sm font-bold text-black">Testmodus: {testRole==='employee'?'Employee':'Responsible'} <button onClick={()=>setTestRole(null)} className="rounded-lg bg-black px-3 py-1 text-white">Terug naar Admin</button></div>}
  <header className="flex min-h-16 items-center justify-between gap-3 border-b bg-card px-4">
   <Link href={roles.includes("admin") ? "/admin" : "/"} className="font-black">Up Till Dawn</Link>
   <div className="flex items-center gap-3 text-sm">
    <span className="hidden sm:inline">{name} · {roleLabel}</span>
    {isAdmin&&!testRole&&<select aria-label="Test als rol" defaultValue="" onChange={e=>{const v=e.target.value;if(v==='employee'||v==='responsible_lead')setTestRole(v)}} className="rounded-lg border bg-background p-2"><option value="" disabled>Test als…</option><option value="employee">Employee</option><option value="responsible_lead">Responsible</option></select>}
    <Link href="/notifications">Meldingen</Link><Link href="/settings">Profiel</Link>
    <form action={signOut}><button className="rounded-lg border p-2">Uitloggen</button></form>
   </div>
  </header>
 </>
}
