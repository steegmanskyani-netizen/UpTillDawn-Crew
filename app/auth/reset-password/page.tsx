"use client"

import { useState,useTransition } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { AlertCircle,CheckCircle2,Eye,EyeOff,Loader2 } from "lucide-react"
import { updatePassword } from "@/lib/actions/auth"
import { Card,CardContent,CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ResetPasswordPage(){
  const router=useRouter()
  const [show,setShow]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [success,setSuccess]=useState<string|null>(null)
  const [pending,startTransition]=useTransition()

  function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault()
    setError(null);setSuccess(null)
    const formData=new FormData(event.currentTarget)
    startTransition(async()=>{
      const result=await updatePassword(formData)
      if(result?.error){setError(result.error);return}
      if(result?.success){
        setSuccess(result.message||"Wachtwoord is bijgewerkt.")
        window.setTimeout(()=>router.push("/login"),900)
      }
    })
  }

  return <Card className="w-full max-w-md rounded-2xl border-border shadow-lg">
    <CardHeader className="items-center space-y-4 pb-2">
      <Image src="/up-till-dawn-mark.webp" alt="UP TILL DAWN" width={48} height={48} className="h-12 w-12 rounded-xl object-cover"/>
      <div className="text-center"><h1 className="text-xl font-bold">Nieuw wachtwoord</h1><p className="text-sm text-muted-foreground">Kies een nieuw wachtwoord van minstens 8 tekens.</p></div>
    </CardHeader>
    <CardContent className="space-y-4">
      {error&&<div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="h-5 w-5 shrink-0"/>{error}</div>}
      {success&&<div className="flex gap-2 rounded-xl border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-600"><CheckCircle2 className="h-5 w-5 shrink-0"/>{success}</div>}
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Nieuw wachtwoord</Label>
          <div className="relative">
            <Input id="password" name="password" type={show?"text":"password"} minLength={8} required autoComplete="new-password" className="h-11 rounded-xl pr-10"/>
            <button type="button" aria-label={show?"Verberg wachtwoord":"Toon wachtwoord"} onClick={()=>setShow(v=>!v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {show?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm_password">Bevestig wachtwoord</Label>
          <Input id="confirm_password" name="confirm_password" type="password" minLength={8} required autoComplete="new-password" className="h-11 rounded-xl"/>
        </div>
        <Button type="submit" disabled={pending||Boolean(success)} className="h-11 w-full rounded-xl">
          {pending&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Wachtwoord opslaan
        </Button>
      </form>
      <Link href="/login" className="block text-center text-sm text-muted-foreground hover:underline">Terug naar inloggen</Link>
    </CardContent>
  </Card>
}
