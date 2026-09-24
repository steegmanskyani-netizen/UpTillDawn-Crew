"use client"
import Link from "next/link"
import { useAuth,useDisplayName } from "@/lib/providers"
import { signOut } from "@/lib/actions/auth"

export function Topbar(){
 const name=useDisplayName()
 const {roles,isAdmin,editMode}=useAuth()
 const baseRoleLabel=roles.includes("admin")?"Beheerder":roles.includes("responsible_lead")?"Verantwoordelijke":"Personeel"
 const roleLabel=editMode?`${baseRoleLabel} (edit)`:baseRoleLabel

 return <header className="flex min-h-16 items-center justify-between gap-3 border-b bg-card px-4">
  <Link href={isAdmin&&!editMode?"/admin":"/"} className="font-black">Up Till Dawn</Link>
  <div className="flex items-center gap-3 text-sm">
   <span className="hidden sm:inline">{name} · {roleLabel}</span>
   <Link href="/notifications">Meldingen</Link>
   <Link href="/settings">Profiel</Link>
   <form action={signOut}><button className="rounded-lg border p-2">Uitloggen</button></form>
  </div>
 </header>
}
