"use client"

import { useEffect } from "react"
import { translateUiText, type UiLocale } from "@/lib/ui-translations"

const SUPPORTED = new Set<UiLocale>(["nl", "fr", "en"])
const originalText = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Map<string, string>>()
const attributes = ["placeholder", "aria-label", "title"] as const

function normalizeLocale(value: string | null | undefined): UiLocale {
  const language = value?.trim().toLowerCase().split(/[-_]/)[0] as UiLocale | undefined
  return language && SUPPORTED.has(language) ? language : "nl"
}

function translateTextNode(node: Text, locale: UiLocale) {
  const current = node.nodeValue || ""
  const trimmed = current.trim()
  if (!trimmed) return

  const original = originalText.get(node) ?? current
  if (!originalText.has(node)) originalText.set(node, original)

  const originalTrimmed = original.trim()
  const translated = translateUiText(originalTrimmed, locale)
  const leading = original.match(/^\s*/)?.[0] || ""
  const trailing = original.match(/\s*$/)?.[0] || ""
  const next = `${leading}${translated}${trailing}`

  if (node.nodeValue !== next) node.nodeValue = next
}

function translateElementAttributes(element: Element, locale: UiLocale) {
  let originals = originalAttributes.get(element)
  if (!originals) {
    originals = new Map<string, string>()
    originalAttributes.set(element, originals)
  }

  for (const attribute of attributes) {
    if (!element.hasAttribute(attribute)) continue
    const current = element.getAttribute(attribute) || ""
    if (!originals.has(attribute)) originals.set(attribute, current)
    const original = originals.get(attribute) || ""
    const translated = translateUiText(original, locale)
    if (current !== translated) element.setAttribute(attribute, translated)
  }
}

function translateNode(root: Node, locale: UiLocale) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text, locale)
    return
  }

  if (!(root instanceof Element) && root !== document.body) return

  if (root instanceof Element) translateElementAttributes(root, locale)

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    translateTextNode(node as Text, locale)
    node = walker.nextNode()
  }

  if (root instanceof Element) {
    root.querySelectorAll("*").forEach(element => translateElementAttributes(element, locale))
  }
}

export function LocaleSync() {
  useEffect(() => {
    let locale = normalizeLocale(window.localStorage.getItem("uptilldawn-language"))
    let applying = false

    const applyLocale = (nextLocale: UiLocale) => {
      locale = nextLocale
      document.documentElement.lang = locale
      window.localStorage.setItem("uptilldawn-language", locale)
      document.cookie = `uptilldawn-language=${locale}; path=/; max-age=31536000; samesite=lax`

      applying = true
      translateNode(document.body, locale)
      document.title = locale === "fr"
        ? "UP TILL DAWN Personnel"
        : locale === "en"
          ? "UP TILL DAWN Staff"
          : "UP TILL DAWN Personeel"
      applying = false
    }

    applyLocale(locale)

    const observer = new MutationObserver(mutations => {
      if (applying) return
      applying = true
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateNode(mutation.target, locale)
        } else {
          mutation.addedNodes.forEach(node => translateNode(node, locale))
        }
      }
      applying = false
    })

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    })

    const onLanguageChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      applyLocale(normalizeLocale(detail))
    }

    window.addEventListener("uptilldawn-language-change", onLanguageChange)

    return () => {
      observer.disconnect()
      window.removeEventListener("uptilldawn-language-change", onLanguageChange)
    }
  }, [])

  return null
}
