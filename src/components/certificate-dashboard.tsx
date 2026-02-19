'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useWallet } from '@/components/wallet-provider'
import config from '@/certifier.config'
import type { CertificateTypeConfig } from '@/lib/config-types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, LogOut, Trash2, ArrowLeft, RefreshCw } from 'lucide-react'

const SERVER_PUB_KEY = process.env.NEXT_PUBLIC_SERVER_PUBLIC_KEY || ''

export default function CertificateDashboard() {
  const { wallet, activeCertificate, activeCertType, checkCertificates, logout } = useWallet()
  const [revoking, setRevoking] = useState(false)

  // Find the matching cert config
  const certConfig: CertificateTypeConfig | undefined = config.certificates.find(
    c => c.certificateTypeBase64 === activeCertType
  )
  const dashboard = certConfig?.dashboard

  // Extract the revocation UTXO txid
  const revocationOutpoint = activeCertificate?.revocationOutpoint || ''
  const revocationUtxoTxid = revocationOutpoint.split('.')[0]
  const isDummyOutpoint = revocationUtxoTxid === '00'.repeat(32)

  // Return URL handling
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const returnUrl = params.get('returnUrl')
    if (returnUrl && (dashboard?.returnUrlAutoRedirect !== false)) {
      setTimeout(() => {
        toast.success('Redirecting...')
        window.location.href = decodeURIComponent(returnUrl)
      }, 2000)
    }
  }, [dashboard])

  const handleRevoke = async () => {
    if (!wallet || !activeCertificate || !activeCertType) return
    setRevoking(true)
    try {
      const res = await fetch('/api/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificate: activeCertificate }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`)

      await wallet.relinquishCertificate({
        type: activeCertType,
        serialNumber: activeCertificate.serialNumber,
        certifier: SERVER_PUB_KEY,
      })

      if (data.txid) {
        toast.success(`Certificate revoked on-chain! TX: ${data.txid.substring(0, 12)}...`, { duration: 5000 })
      } else {
        toast.success('Certificate revoked')
      }
      logout()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Revocation failed: ' + msg)
    } finally {
      setRevoking(false)
    }
  }

  const handleRefresh = async () => {
    await checkCertificates()
    toast.success('Certificate refreshed')
  }

  const handleReturn = () => {
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
          <CardTitle>{dashboard?.successTitle || 'Welcome Back!'}</CardTitle>
          <p className="text-muted-foreground">
            {dashboard?.successDescription || 'You are successfully logged in with your certificate.'}
          </p>
          {returnUrl && (
            <p className="text-sm text-blue-600 mt-2">Auto-redirecting...</p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {revocationUtxoTxid && !isDummyOutpoint && (
            <div className="p-3 bg-muted rounded-lg text-xs font-mono break-all">
              <p className="text-muted-foreground mb-1 font-sans text-sm font-medium">Revocation UTXO</p>
              <p>{revocationUtxoTxid}</p>
            </div>
          )}

          {returnUrl && (
            <Button onClick={handleReturn} className="w-full gap-2">
              <ArrowLeft className="h-4 w-4" />
              {dashboard?.returnUrlLabel || 'Return'}
            </Button>
          )}
          <Button onClick={handleRefresh} variant="outline" className="w-full gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh Certificate
          </Button>
          <Button onClick={handleRevoke} variant="destructive" className="w-full gap-2" disabled={revoking}>
            <Trash2 className="h-4 w-4" />
            {revoking ? 'Revoking...' : 'Revoke Certificate'}
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
