"use client"

import { useEffect } from "react"

const SUPPORTED = new Set(["nl", "fr", "en"])

function normalizeLocale(value: string | null | undefined) {
  const language = value?.trim().toLowerCase().split(/[-_]/)[0]
  return language && SUPPORTED.has(language) ? language : "nl"
}

export function LocaleSync() {
  useEffect(() => {
    const stored = window.localStorage.getItem("uptilldawn-language")
    const locale = stored ? normalizeLocale(stored) : "nl"

    document.documentElement.lang = locale
    window.localStorage.setItem("uptilldawn-language", locale)
  }, [])

  return null
}
