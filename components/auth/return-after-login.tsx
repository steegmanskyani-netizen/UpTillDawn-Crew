'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

export function ReturnAfterLogin() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const target = window.sessionStorage.getItem('uptilldawn-return-after-login')
    if (!target) return
    window.sessionStorage.removeItem('uptilldawn-return-after-login')
    if (target.startsWith('/') && !target.startsWith('//') && !target.includes('\\') && target !== pathname) {
      router.replace(target)
    }
  }, [pathname, router])

  return null
}
