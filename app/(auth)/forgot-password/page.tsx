"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
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
        <img
          src="/uptilldawn-logo.jpeg"
          alt="Uptilldawn"
          className="h-10"
        />
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-foreground">
            {sent ? "Check your email" : "Reset your password"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {sent
              ? `If an account exists for ${sentTo}, a reset link has been sent.`
              : "Enter your @yourcompany.com email and we'll send a reset link"}
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
              Check your spam folder if you don&apos;t see it, or{" "}
              <button
                onClick={() => { setSent(false); setError(null) }}
                className="text-brand-taupe hover:underline"
              >
                try again
              </button>.
            </p>
            <Button variant="outline" className="rounded-xl" asChild>
              <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" />Back to login</Link>
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
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@yourcompany.com"
                  className="rounded-xl h-11"
                  required
                />
              </div>
              <Button type="submit" className="w-full rounded-xl h-11" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
            </form>
            <div className="flex justify-center">
              <Link href="/login" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" />Back to login
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
