"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { forgotPassword } from "@/lib/actions/auth"

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [sentTo, setSentTo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string

    startTransition(async () => {
      const result = await forgotPassword(formData)
      if (result?.error) {
        setError(result.error)
      } else {
        setSentTo(email)
        setSent(true)
      }
    })
  }

  return (
    <Card className="w-full max-w-md rounded-2xl border-border shadow-lg">
      <CardHeader className="items-center space-y-4 pb-2">
        <Image src="/uptilldawn-logo.jpeg" alt="Uptilldawn" width={220} height={80} className="h-10 w-auto object-contain" />
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-foreground">
            {sent ? "Controleer je e-mail" : "Wachtwoord herstellen"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {sent
              ? `Als er een account bestaat voor ${sentTo}, is een herstel-link verstuurd.`
              : "Vul je e-mailadres in en we sturen een herstel-link."}
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-2">
        {sent ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Controleer ook je spammap als je niets ziet, of{" "}
              <button
                onClick={() => { setSent(false); setError(null) }}
                className="text-brand-taupe hover:underline"
              >
                probeer opnieuw
              </button>.
            </p>
            <Button variant="outline" className="rounded-xl" asChild>
              <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" />Terug naar inloggen</Link>
            </Button>
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="naam@email.com"
                  className="rounded-xl h-11"
                  required
                />
              </div>
              <Button type="submit" className="w-full rounded-xl h-11" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Herstel-link versturen
              </Button>
            </form>
            <div className="flex justify-center">
              <Link href="/login" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" />Terug naar inloggen
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
