import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { WalletProvider } from '@/components/wallet-provider'
import { Toaster } from 'react-hot-toast'
import config from '@/certifier.config'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: `${config.branding.appName} - Digital Identity Certification`,
  description: config.branding.description || 'Generate BSV-based digital identity certificates with DIDs and VCs',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const style: Record<string, string> = {}
  if (config.branding.primaryColor) style['--primary'] = config.branding.primaryColor
  if (config.branding.accentColor) style['--accent'] = config.branding.accentColor

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={Object.keys(style).length > 0 ? style : undefined}
      >
        <WalletProvider>
          <Toaster />
          {children}
        </WalletProvider>
      </body>
    </html>
  )
}
