import { PwaRegister } from '@/components/pwa-register'
import { LocaleSync } from '@/components/locale-sync'
import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/lib/providers'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'


export const metadata: Metadata = {
  title: 'UPTILLDAWN Crew',
  description: 'Event crew management voor Uptilldawn',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'UPTILLDAWN Crew',
  },
  icons: {
    icon: '/uptilldawn-logo.jpeg',
    apple: '/uptilldawn-logo.jpeg',
  },
}

export const viewport: Viewport = {
  themeColor: '#050505',
  userScalable: true,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <LocaleSync /><PwaRegister />{children}
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
