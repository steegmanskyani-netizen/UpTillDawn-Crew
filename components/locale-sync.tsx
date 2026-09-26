"use client"

import { useEffect } from "react"
import { translateUiText, type UiLocale } from "@/lib/ui-translations"
import { translateUiExtension, type ExtendedUiLocale } from "@/lib/ui-translation-extensions"

const SUPPORTED = new Set<ExtendedUiLocale>(["nl", "fr", "en", "de"])
const originalText = new WeakMap<Text, string>()
const renderedText = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Map<string, string>>()
const renderedAttributes = new WeakMap<Element, Map<string, string>>()
const attributes = ["placeholder", "aria-label", "title"] as const

function parseLocale(value: string | null | undefined): ExtendedUiLocale | null {
  const language = value?.trim().toLowerCase().split(/[-_]/)[0] as ExtendedUiLocale | undefined
  return language && SUPPORTED.has(language) ? language : null
}

function normalizeLocale(value: string | null | undefined): ExtendedUiLocale {
  return parseLocale(value) || "nl"
}

function deviceLocale(): ExtendedUiLocale {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const candidate of candidates) {
    const locale = parseLocale(candidate)
    if (locale) return locale
  }
  return "nl"
}

function translate(value: string, locale: ExtendedUiLocale) {
  const extended = translateUiExtension(value, locale)
  if (extended !== value || locale === "de") return extended
  return translateUiText(value, locale as UiLocale)
}

function isExcluded(node: Node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
  return Boolean(element?.closest("[data-no-translate]"))
}

function translateTextNode(node: Text, locale: ExtendedUiLocale) {
  if (isExcluded(node)) return
  const current = node.nodeValue || ""
  if (!current.trim()) return
  const previousRendered = renderedText.get(node)
  if (!originalText.has(node) || (previousRendered !== undefined && current !== previousRendered)) originalText.set(node, current)
  const original = originalText.get(node) || current
  const leading = original.match(/^\s*/)?.[0] || ""
  const trailing = original.match(/\s*$/)?.[0] || ""
  const next = `${leading}${translate(original.trim(), locale)}${trailing}`
  renderedText.set(node, next)
  if (node.nodeValue !== next) node.nodeValue = next
}

function translateElementAttributes(element: Element, locale: ExtendedUiLocale) {
  if (element.closest("[data-no-translate]")) return
  let originals = originalAttributes.get(element)
  if (!originals) { originals = new Map<string, string>(); originalAttributes.set(element, originals) }
  let rendered = renderedAttributes.get(element)
  if (!rendered) { rendered = new Map<string, string>(); renderedAttributes.set(element, rendered) }
  for (const attribute of attributes) {
    if (!element.hasAttribute(attribute)) continue
    const current = element.getAttribute(attribute) || ""
    const previousRendered = rendered.get(attribute)
    if (!originals.has(attribute) || (previousRendered !== undefined && current !== previousRendered)) originals.set(attribute, current)
    const original = originals.get(attribute) || current
    const translated = translate(original, locale)
    rendered.set(attribute, translated)
    if (current !== translated) element.setAttribute(attribute, translated)
  }
}

function translateNode(root: Node, locale: ExtendedUiLocale) {
  if (isExcluded(root)) return
  if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root as Text, locale); return }
  if (!(root instanceof Element) && root !== document.body) return
  if (root instanceof Element) translateElementAttributes(root, locale)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) { translateTextNode(node as Text, locale); node = walker.nextNode() }
  if (root instanceof Element) root.querySelectorAll("*").forEach(element => translateElementAttributes(element, locale))
}

export function LocaleSync() {
  useEffect(() => {
    const storedLocale = parseLocale(window.localStorage.getItem("uptilldawn-language"))
    let locale = storedLocale || deviceLocale()
    let applying = false

    const applyLocale = (nextLocale: ExtendedUiLocale, persist = false) => {
      locale = nextLocale
      document.documentElement.lang = locale
      if (persist) {
        window.localStorage.setItem("uptilldawn-language", locale)
        document.cookie = `uptilldawn-language=${locale}; path=/; max-age=31536000; samesite=lax`
      }
      applying = true
      translateNode(document.body, locale)
      document.title = locale === "fr" ? "UP TILL DAWN Personnel" : locale === "en" ? "UP TILL DAWN Staff" : locale === "de" ? "UP TILL DAWN Personal" : "UP TILL DAWN Personeel"
      applying = false
    }

    applyLocale(locale, Boolean(storedLocale))

    const observer = new MutationObserver(mutations => {
      if (applying) return
      applying = true
      for (const mutation of mutations) {
        if (mutation.type === "characterData") translateNode(mutation.target, locale)
        else if (mutation.type === "attributes") translateElementAttributes(mutation.target as Element, locale)
        else mutation.addedNodes.forEach(node => translateNode(node, locale))
      }
      applying = false
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...attributes] })

    const onLanguageChange = (event: Event) => applyLocale(normalizeLocale((event as CustomEvent<string>).detail), true)
    const onDeviceLanguageChange = () => {
      if (!window.localStorage.getItem("uptilldawn-language")) applyLocale(deviceLocale(), false)
    }
    window.addEventListener("uptilldawn-language-change", onLanguageChange)
    window.addEventListener("languagechange", onDeviceLanguageChange)
    return () => {
      observer.disconnect()
      window.removeEventListener("uptilldawn-language-change", onLanguageChange)
      window.removeEventListener("languagechange", onDeviceLanguageChange)
    }
  }, [])
  return null
}
