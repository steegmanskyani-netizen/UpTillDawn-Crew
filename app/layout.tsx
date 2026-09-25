import { PwaRegister } from '@/components/pwa-register'
import { PushPermissionPrompt } from '@/components/push-permission-prompt'
import { LocaleSync } from '@/components/locale-sync'
import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/lib/providers'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'


export const metadata: Metadata = {
  metadataBase: new URL('https://crew-uptilldawn.be'),
  title: {
    default: 'UP TILL DAWN Crew',
    template: '%s | UP TILL DAWN Crew',
  },
  description: 'Crew- en personeelsbeheer voor Up Till Dawn-evenementen.',
  applicationName: 'UP TILL DAWN Crew',
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    siteName: 'UP TILL DAWN Crew',
    title: 'UP TILL DAWN Crew',
    description: 'Crew- en personeelsbeheer voor Up Till Dawn-evenementen.',
    url: 'https://crew-uptilldawn.be',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'UP TILL DAWN Personeel',
  },
  icons: {
    icon: '/up-till-dawn-mark.webp',
    apple: '/up-till-dawn-mark.webp',
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
            <LocaleSync /><PwaRegister /><PushPermissionPrompt />{children}
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
