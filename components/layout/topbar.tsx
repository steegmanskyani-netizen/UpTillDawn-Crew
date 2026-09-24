"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth,useDisplayName } from "@/lib/providers"
import { signOut } from "@/lib/actions/auth"

export function Topbar(){
 const router=useRouter()
 const name=useDisplayName()
 const {roles,isAdmin,testMode,setTestMode,testRole,setTestRole}=useAuth()
 const roleLabel=testMode&&testRole==='employee'?'Personeel (test)':testMode&&testRole==='responsible_lead'?'Verantwoordelijke (test)':roles.includes('admin')?'Beheerder':roles.includes('responsible_lead')?'Verantwoordelijke':'Personeel'

 function activate(){
   setTestMode(true)
   router.push("/")
   router.refresh()
 }
 function deactivate(){
   setTestMode(false)
   router.push("/admin")
   router.refresh()
 }
 function changeRole(role:"employee"|"responsible_lead"){
   setTestRole(role)
   router.push("/")
   router.refresh()
 }

 return <>
  {isAdmin&&testMode&&<div className="flex flex-wrap items-center justify-center gap-3 bg-amber-500 px-3 py-2 text-sm font-bold text-black">
    <span>TESTMODUS ACTIEF</span>
    <select aria-label="Testrol" value={testRole||"employee"} onChange={e=>changeRole(e.target.value as "employee"|"responsible_lead")} className="rounded-lg border border-black/30 bg-white px-3 py-1 text-black">
      <option value="employee">Personeel</option>
      <option value="responsible_lead">Verantwoordelijke</option>
    </select>
    <button onClick={deactivate} className="rounded-lg bg-black px-3 py-1 text-white">TESTMODUS DEACTIVEREN</button>
  </div>}
  <header className="flex min-h-16 items-center justify-between gap-3 border-b bg-card px-4">
   <Link href={isAdmin&&!testMode?"/admin":"/"} className="font-black">Up Till Dawn</Link>
   <div className="flex items-center gap-3 text-sm">
    <span className="hidden sm:inline">{name} · {roleLabel}</span>
    {isAdmin&&!testMode&&<button type="button" onClick={activate} className="rounded-lg border border-amber-500/50 px-3 py-2 font-bold">TESTMODUS ACTIVEREN</button>}
    <Link href="/notifications">Meldingen</Link><Link href="/settings">Profiel</Link>
    <form action={signOut}><button className="rounded-lg border p-2">Uitloggen</button></form>
   </div>
  </header>
 </>
}
