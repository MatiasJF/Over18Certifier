'use client'

import { useState } from 'react'
import { P2PKH, PublicKey } from '@bsv/sdk'
import { toast } from 'react-hot-toast'
import { useWallet } from '@/components/wallet-provider'
import config from '@/certifier.config'
import type { CertificateTypeConfig } from '@/lib/config-types'
import { Button } from '@/components/ui/button'
import VerificationFlow from '@/components/verification-flow'
import CertificateSelector from '@/components/certificate-selector'
import DynamicCertificateForm from '@/components/dynamic-certificate-form'
import CertificateDashboard from '@/components/certificate-dashboard'

export default function Home() {
  const { wallet, identityKey, isConnected, step, setStep, connectWallet } = useWallet()
  const [verifiedValues, setVerifiedValues] = useState<Record<string, string>>({})
  const [selectedCertConfig, setSelectedCertConfig] = useState<CertificateTypeConfig | null>(null)
  const [funding, setFunding] = useState(false)

  const handleVerificationComplete = (values: Record<string, string>) => {
    setVerifiedValues(values)
    if (config.certificates.length > 1) {
      setStep('select')
    } else {
      setStep('form')
    }
  }

  const handleCertSelected = (certConfig: CertificateTypeConfig) => {
    setSelectedCertConfig(certConfig)
    setStep('form')
  }

  // Resolve which cert config to use for the form
  const activeCertConfig = selectedCertConfig ?? config.certificates[0] ?? null

  const handleFundCertifier = async () => {
    if (!wallet || !identityKey) return
    setFunding(true)
    try {
      const reqRes = await fetch('/api/fund?action=request&satoshis=10000')
      const reqData = await reqRes.json()
      if (!reqData.success) throw new Error(reqData.error)

      const { serverIdentityKey, derivationPrefix, derivationSuffix, satoshis } = reqData.paymentRequest

      const { publicKey: derivedKey } = await wallet.getPublicKey({
        protocolID: [2, '3241645161d8'],
        keyID: `${derivationPrefix} ${derivationSuffix}`,
        counterparty: serverIdentityKey,
        forSelf: false
      })

      const lockingScript = new P2PKH()
        .lock(PublicKey.fromString(derivedKey).toAddress())
        .toHex()

      const result = await wallet.createAction({
        description: `Fund certifier wallet (${satoshis} sats)`,
        outputs: [{
          lockingScript,
          satoshis,
          outputDescription: 'Certifier funding'
        }],
        options: { randomizeOutputs: false }
      })

      if (!result.tx) throw new Error('No transaction bytes returned')

      const receiveRes = await fetch('/api/fund?action=receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx: Array.from(result.tx),
          senderIdentityKey: identityKey,
          derivationPrefix,
          derivationSuffix,
          outputIndex: 0
        })
      })

      const receiveData = await receiveRes.json()
      if (!receiveData.success) throw new Error(receiveData.error)

      toast.success(`Funded certifier with ${satoshis} sats`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Funding failed: ' + msg)
    } finally {
      setFunding(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4 flex gap-2">
        {isConnected && (
          <Button
            onClick={handleFundCertifier}
            disabled={funding}
            variant="outline"
            size="sm"
          >
            {funding ? 'Funding...' : 'Fund Certifier'}
          </Button>
        )}
        <Button
          onClick={connectWallet}
          disabled={isConnected}
          variant={isConnected ? 'secondary' : 'default'}
        >
          {isConnected ? 'Wallet Connected' : 'Connect Wallet'}
        </Button>
      </div>

      <div className="w-full max-w-md">
        {step === 'verification' && (
          <VerificationFlow onComplete={handleVerificationComplete} />
        )}
        {step === 'select' && (
          <CertificateSelector onSelect={handleCertSelected} />
        )}
        {step === 'form' && activeCertConfig && (
          <DynamicCertificateForm
            certConfig={activeCertConfig}
            verifiedValues={verifiedValues}
          />
        )}
        {step === 'dashboard' && <CertificateDashboard />}
      </div>
    </div>
  )
}
