'use client'

import React, { useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { useWallet } from '@/components/wallet-provider'
import { CERT_TYPE_BVC } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, LogOut, Trash2, ArrowLeft, RefreshCw } from 'lucide-react'

const SERVER_PUB_KEY = process.env.NEXT_PUBLIC_SERVER_PUBLIC_KEY || ''

export default function CertificateDashboard() {
  const { wallet, bvcCertificate, checkCertificates, logout } = useWallet()

  // Check for return URL and auto-redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const returnUrl = params.get('returnUrl')
    if (returnUrl) {
      setTimeout(() => {
        toast.success('Redirecting back to whiskey store...')
        window.location.href = decodeURIComponent(returnUrl)
      }, 2000)
    }
  }, [])

  const handleRevoke = async () => {
    if (!wallet || !bvcCertificate) return
    try {
      await wallet.relinquishCertificate({
        type: CERT_TYPE_BVC,
        serialNumber: bvcCertificate.serialNumber,
        certifier: SERVER_PUB_KEY,
      })

      // Notify server
      await fetch('/api/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificate: bvcCertificate }),
      })

      toast.success('Certificate revoked')
      logout()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Revocation failed: ' + msg)
    }
  }

  const handleRefresh = async () => {
    await checkCertificates()
    toast.success('Certificate refreshed')
  }

  const handleReturnToStore = () => {
    const params = new URLSearchParams(window.location.search)
    const returnUrl = params.get('returnUrl')
    if (returnUrl) window.location.href = decodeURIComponent(returnUrl)
  }

  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const returnUrl = params?.get('returnUrl')

  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle>Welcome Back!</CardTitle>
          <p className="text-muted-foreground">You are successfully logged in with your certificate.</p>
          {returnUrl && (
            <p className="text-sm text-blue-600 mt-2">Auto-redirecting to the whiskey store...</p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {returnUrl && (
            <Button onClick={handleReturnToStore} className="w-full gap-2">
              <ArrowLeft className="h-4 w-4" />
              Return to Whiskey Store
            </Button>
          )}
          <Button onClick={handleRefresh} variant="outline" className="w-full gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh Certificate
          </Button>
          <Button onClick={handleRevoke} variant="destructive" className="w-full gap-2">
            <Trash2 className="h-4 w-4" />
            Revoke Certificate
          </Button>
          <Button onClick={logout} variant="outline" className="w-full gap-2">
            <LogOut className="h-4 w-4" />
            Logout (Keep Certificate)
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
