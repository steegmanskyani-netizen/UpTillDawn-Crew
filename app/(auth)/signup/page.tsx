"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react"
import { signUp } from "@/lib/actions/auth"



export default function SignupPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const validate = (formData: FormData): Record<string, string> => {
    const errors: Record<string, string> = {}
    const email = (formData.get("email") as string)?.trim().toLowerCase()
    const password = formData.get("password") as string
    const confirm = formData.get("confirm_password") as string
    const name = (formData.get("full_name") as string)?.trim()

    if (!name) errors.full_name = "Volledige naam is verplicht"
    if (!email) errors.email = "E-mail is verplicht"

    if (password.length < 8) errors.password = "Wachtwoord moet minstens 8 tekens bevatten"
    if (password !== confirm) errors.confirm_password = "Wachtwoorden komen niet overeen"

    return errors
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setServerError(null)

    const formData = new FormData(e.currentTarget)
    const errors = validate(formData)

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    startTransition(async () => {
      const result = await signUp(formData)
      if (result?.error) {
        setServerError(result.error)
      } else if (result?.success) {
        router.push("/verify-email")
      }
    })
  }

  return (
    <Card className="w-full max-w-md rounded-2xl border-border shadow-lg">
      <CardHeader className="items-center space-y-4 pb-2">
        <Image src="/uptilldawn-logo.jpeg" alt="Uptilldawn" width={220} height={80} className="h-10 w-auto object-contain" />
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-foreground">Account aanmaken</h1>
          <p className="text-sm text-muted-foreground">
            Je account moet na registratie door een administrator worden goedgekeurd.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-2">
        {/* Server error */}
        {serverError && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
            <p className="text-sm text-destructive">{serverError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full name */}
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Volledige naam</Label>
            <Input
              id="full_name"
              name="full_name"
              placeholder="Voornaam Achternaam"
              className="rounded-xl h-11"
              autoComplete="name"
            />
            {fieldErrors.full_name && (
              <p className="text-xs text-destructive">{fieldErrors.full_name}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="naam@voorbeeld.be"
              className="rounded-xl h-11"
              autoComplete="email"
            />
            {fieldErrors.email && (
              <p className="text-xs text-destructive">{fieldErrors.email}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="password">Wachtwoord</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Min. 8 tekens"
                className="rounded-xl h-11 pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Verberg wachtwoord" : "Toon wachtwoord"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="text-xs text-destructive">{fieldErrors.password}</p>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm_password">Bevestig wachtwoord</Label>
            <Input
              id="confirm_password"
              name="confirm_password"
              type="password"
              placeholder="Herhaal je wachtwoord"
              className="rounded-xl h-11"
              autoComplete="new-password"
            />
            {fieldErrors.confirm_password && (
              <p className="text-xs text-destructive">{fieldErrors.confirm_password}</p>
            )}
          </div>

          <Button type="submit" className="w-full rounded-xl h-11" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Account aanmaken
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Heb je al een account?{" "}
          <Link href="/login" className="font-medium text-brand-taupe hover:underline">
            Inloggen
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
