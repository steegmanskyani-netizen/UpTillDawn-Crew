"use client"

import { useEffect, useState } from "react"

const languages = [
  { value: "nl", label: "Nederlands" },
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
] as const

export function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const [language, setLanguage] = useState("nl")

  useEffect(() => {
    const stored = window.localStorage.getItem("uptilldawn-language")
    setLanguage(stored === "fr" || stored === "en" ? stored : "nl")
  }, [])

  return <label className={`flex items-center justify-between gap-3 text-sm ${dark ? "text-zinc-300" : "text-muted-foreground"}`}>
    <span>Taal</span>
    <select
      aria-label="Taal wijzigen"
      value={language}
      onChange={event => {
        const next = event.target.value
        setLanguage(next)
        window.localStorage.setItem("uptilldawn-language", next)
        document.documentElement.lang = next
        window.dispatchEvent(new CustomEvent("uptilldawn-language-change", { detail: next }))
      }}
      className={`rounded-lg border px-3 py-2 ${dark ? "border-white/15 bg-black text-white" : "bg-background text-foreground"}`}
    >
      {languages.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
  </label>
}
