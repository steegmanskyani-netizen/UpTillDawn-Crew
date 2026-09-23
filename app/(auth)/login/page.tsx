"use client"

import { useState, useTransition } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Menu, X, Eye, EyeOff, Loader2, AlertCircle, ArrowRight, ShieldCheck, Users, UserCog } from "lucide-react"
import { signIn } from "@/lib/actions/auth"

const portals = {
  staff: { label: "Staff Login", icon: Users },
  responsible: { label: "Responsible Login", icon: UserCog },
  admin: { label: "Admin Login", icon: ShieldCheck },
} as const

type Portal = keyof typeof portals

export default function LoginPage() {
  const pathname = usePathname()
  const slug = pathname.split("/").filter(Boolean)[1] as Portal | undefined
  const portal: Portal = slug && slug in portals ? slug : "staff"
  const PortalIcon = portals[portal].icon
  const [menuOpen, setMenuOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set("portal", portal)
    startTransition(async () => {
      const result = await signIn(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <main className="min-h-screen bg-black text-white relative overflow-hidden">
      <button
        type="button"
        aria-label="Open login menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(v => !v)}
        className="fixed left-5 top-5 z-50 grid h-12 w-12 place-items-center rounded-xl border border-white/15 bg-black/70 backdrop-blur hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
      >
        {menuOpen ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
      </button>

      {menuOpen && (
        <div className="fixed left-5 top-20 z-50 w-64 rounded-2xl border border-white/15 bg-zinc-950/95 p-2 shadow-2xl backdrop-blur-xl">
          {(Object.keys(portals) as Portal[]).map(key => {
            const Icon = portals[key].icon
            return (
              <Link
                key={key}
                href={`/login/${key}`}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${portal === key ? "bg-white text-black" : "text-white hover:bg-white/10"}`}
              >
                <Icon className="h-5 w-5" />{portals[key].label}
              </Link>
            )
          })}
        </div>
      )}

      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center px-6 pb-10 pt-20 sm:pt-12">
        <div className="flex min-h-[260px] w-full items-center justify-center sm:min-h-[330px]">
          <Image src="/uptilldawn-logo.jpeg" alt="Up Till Dawn crew" width={500} height={320} priority className="max-h-[320px] w-full max-w-[500px] object-contain" />
        </div>

        <section className="w-full rounded-3xl border border-white/15 bg-zinc-950 p-6 shadow-2xl sm:p-8">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5">
              <PortalIcon className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-black tracking-tight">{portals[portal].label}</h1>
            <p className="mt-1 text-sm text-zinc-400">UPTILLDAWN CREW MANAGEMENT</p>
          </div>

          {error && (
            <div className="mb-5 flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-200">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold">E-mail</label>
              <input id="email" name="email" type="email" autoComplete="email" required placeholder="naam@email.com" className="h-12 w-full rounded-xl border border-white/15 bg-black px-4 text-white outline-none placeholder:text-zinc-600 focus:border-white/50" />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-semibold">Wachtwoord</label>
                <Link href="/forgot-password" className="text-xs text-zinc-400 hover:text-white">Wachtwoord vergeten?</Link>
              </div>
              <div className="relative">
                <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="••••••••" className="h-12 w-full rounded-xl border border-white/15 bg-black px-4 pr-12 text-white outline-none placeholder:text-zinc-600 focus:border-white/50" />
                <button type="button" aria-label={showPassword ? "Verberg wachtwoord" : "Toon wachtwoord"} onClick={() => setShowPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white">
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <button disabled={isPending} type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white font-black text-black transition hover:bg-zinc-200 disabled:opacity-60">
              {isPending ? <><Loader2 className="h-5 w-5 animate-spin" />Inloggen…</> : <>Inloggen<ArrowRight className="h-5 w-5" /></>}
            </button>
          </form>

          <div className="mt-6 border-t border-white/10 pt-5 text-center text-sm text-zinc-400">
            Nog geen account? <Link href="/signup" className="font-bold text-white hover:underline">Account aanmaken</Link>
          </div>
        </section>
      </div>
    </main>
  )
}
