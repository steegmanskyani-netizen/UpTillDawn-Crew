"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Mail, RefreshCw, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { resendVerificationEmail } from "@/lib/actions/auth"

export default function VerifyEmailClient() {
  const searchParams = useSearchParams()
  const urlError = searchParams.get("error")

  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(urlError)
  const [isPending, startTransition] = useTransition()

  const handleResend = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSent(false)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await resendVerificationEmail(formData)
      if (result?.error) {
        setError(result.error)
      } else {
        setSent(true)
      }
    })
  }

  return (
    <Card className="w-full max-w-md rounded-2xl border-border shadow-lg">
      <CardHeader className="items-center space-y-4 pb-2">
        <Image src="/up-till-dawn-mark.webp" alt="UP TILL DAWN" width={48} height={48} className="h-12 w-12 rounded-xl object-cover" />
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-gold/10">
          <Mail className="h-8 w-8 text-brand-gold" />
        </div>
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-foreground">Verifieer je e-mail</h1>
          <p className="text-sm text-muted-foreground">
            We hebben een verificatielink naar je e-mailadres gestuurd. Klik op de link om je account te activeren.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
            <p className="text-sm text-destructive">{decodeURIComponent(error)}</p>
          </div>
        )}

        {sent && (
          <div className="flex items-start gap-3 rounded-xl border border-green-500/30 bg-green-500/5 p-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 mt-0.5" />
            <p className="text-sm text-green-700 dark:text-green-400">
              Verificatiemail verzonden. Controleer je inbox.
            </p>
          </div>
        )}

        <form onSubmit={handleResend} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Je e-mailadres</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="naam@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl h-11"
              required
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            className="w-full rounded-xl h-11 gap-2"
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Verificatiemail opnieuw versturen
          </Button>
        </form>

        <div className="text-center">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Terug naar inloggen
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
