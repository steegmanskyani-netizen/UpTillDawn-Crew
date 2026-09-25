import type { Metadata } from "next"
import { Footer } from "@/components/shared/footer"

export const metadata: Metadata = {
  title: 'Crew login',
  description: 'Log in of maak een account aan voor het crewplatform van Up Till Dawn.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/login' },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        {children}
      </div>
      <Footer />
    </div>
  )
}
