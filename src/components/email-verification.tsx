'use client'

import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import config from '@/certifier.config'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  onVerified: (email: string) => void
  onSkip?: () => void
  initialEmail?: string
  label?: string
}

export default function EmailVerification({ onVerified, onSkip, initialEmail = '', label }: Props) {
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)

  const appName = config.branding.appName

  const handleSendCode = async () => {
    if (!email.trim()) {
      toast.error('Please enter an email address')
      return
    }
    const generatedCode = Math.floor(100000 + Math.random() * 900000)
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: generatedCode, type: 'sendEmail' }),
      })
      const data = await res.json()
      if (!data.sentStatus) {
        toast.error('Failed to send verification email')
        return
      }
      toast.success('Verification code sent!')
      setCodeSent(true)
    } catch {
      toast.error('Failed to send email')
    }
  }

  const handleVerify = async () => {
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, type: 'verifyCode' }),
      })
      const data = await res.json()
      if (!data.verificationStatus) {
        toast.error(data.message || 'Verification failed')
        return
      }
      // Clean up the code from storage
      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: 'delete-on-verified' }),
      })
      toast.success('Email verified!')
      onVerified(email)
    } catch {
      toast.error('Verification failed')
    }
  }

  return (
    <Card>
      {codeSent ? (
        <CardHeader>
          <CardTitle className="text-center">Check your email for a verification code</CardTitle>
        </CardHeader>
      ) : (
        <CardHeader>
          <CardTitle className="text-center">
            {label || `Certify your identity using your email address`}
          </CardTitle>
          <p className="text-muted-foreground text-center">
            {appName} will send you an email to verify
          </p>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {codeSent ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="verification-code">Verification Code</Label>
              <Input
                id="verification-code"
                type="text"
                placeholder="Enter verification code"
                value={code}
                onChange={e => setCode(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Button onClick={handleVerify} className="w-full">
                Verify
              </Button>
              <Button onClick={() => setCodeSent(false)} variant="outline" className="w-full">
                Go back
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="email-verify">Email Address</Label>
              <Input
                id="email-verify"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <Button onClick={handleSendCode} className="w-full">
              Send Verification Code
            </Button>
            {onSkip && (
              <Button onClick={onSkip} variant="ghost" className="w-full">
                Skip this step
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
