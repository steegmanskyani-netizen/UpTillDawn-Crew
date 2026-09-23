"use client"

import { AppSidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { MobileBottomNav } from "@/components/layout/mobile-nav"
import Link from "next/link"
import { QueueStatus } from "@/components/crew/queue-status"
import { MessageCircle } from "lucide-react"

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-background print:block print:h-auto print:overflow-visible">
      <div className="print:hidden"><AppSidebar /></div>
      <div className="flex flex-1 flex-col overflow-hidden print:block print:overflow-visible">
        <div className="print:hidden"><Topbar /><QueueStatus /></div>
        <div id="app-scroll" className="flex-1 overflow-y-auto bg-background scroll-smooth print:overflow-visible">
          <main className="min-h-[calc(100dvh-theme(spacing.16)-theme(spacing.12))] pb-20 md:pb-0 print:min-h-0 print:pb-0">
            {children}
          </main>
        </div>
        <div className="print:hidden"><MobileBottomNav /></div>
      </div>
      <div className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-between print:hidden md:hidden">
        <Link href="/incidents" className="rounded-full bg-red-600 px-5 py-4 font-black text-white">URGENT</Link>
        <Link href="/chat" aria-label="Chat" className="flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-black text-white shadow-lg">
          <MessageCircle className="h-7 w-7" />
        </Link>
      </div>
    </div>
  )
}
