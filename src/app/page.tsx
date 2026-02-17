'use client'

import { useState } from 'react'
import { useWallet } from '@/components/wallet-provider'
import { Button } from '@/components/ui/button'
import EmailVerification from '@/components/email-verification'
import IdentityForm from '@/components/identity-form'
import CertificateDashboard from '@/components/certificate-dashboard'

export default function Home() {
  const { isConnected, step, setStep, connectWallet } = useWallet()
  const [verifiedEmail, setVerifiedEmail] = useState('')

  const handleEmailVerified = (email: string) => {
    setVerifiedEmail(email)
    setStep('form')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <Button
          onClick={connectWallet}
          disabled={isConnected}
          variant={isConnected ? 'secondary' : 'default'}
        >
          {isConnected ? 'Wallet Connected' : 'Connect Wallet'}
        </Button>
      </div>

      <div className="w-full max-w-md">
        {step === 'email' && <EmailVerification onVerified={handleEmailVerified} />}
        {step === 'form' && <IdentityForm verifiedEmail={verifiedEmail} />}
        {step === 'dashboard' && <CertificateDashboard />}
      </div>
    </div>
  )
}
