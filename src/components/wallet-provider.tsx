'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { WalletClient, Utils } from '@bsv/sdk'
import { toast } from 'react-hot-toast'
import { CERT_TYPE_BDID, CERT_TYPE_BVC, type CertStep, type WalletCertificate } from '@/lib/types'

interface WalletState {
  wallet: InstanceType<typeof WalletClient> | null
  identityKey: string | null
  isConnected: boolean
  hasBdid: boolean
  hasBvc: boolean
  bvcCertificate: WalletCertificate | null
  step: CertStep
  setStep: (step: CertStep) => void
  connectWallet: () => Promise<void>
  checkCertificates: () => Promise<void>
  logout: () => void
}

const WalletContext = createContext<WalletState | null>(null)

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}

const SERVER_PUB_KEY = process.env.NEXT_PUBLIC_SERVER_PUBLIC_KEY || ''

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<InstanceType<typeof WalletClient> | null>(null)
  const [identityKey, setIdentityKey] = useState<string | null>(null)
  const [hasBdid, setHasBdid] = useState(false)
  const [hasBvc, setHasBvc] = useState(false)
  const [bvcCertificate, setBvcCertificate] = useState<WalletCertificate | null>(null)
  const [step, setStep] = useState<CertStep>('email')
  const hasChecked = useRef(false)

  const isConnected = !!wallet && !!identityKey

  const checkCertificates = useCallback(async () => {
    if (!wallet || !SERVER_PUB_KEY) return
    try {
      const result = await wallet.listCertificates({
        certifiers: [SERVER_PUB_KEY],
        types: [CERT_TYPE_BDID, CERT_TYPE_BVC],
      })

      let certs: WalletCertificate[] = []
      if (Array.isArray(result)) {
        certs = result as WalletCertificate[]
      } else if (result && typeof result === 'object' && 'certificates' in result) {
        certs = (result as { certificates: WalletCertificate[] }).certificates || []
      }

      const bdidCerts = certs.filter(c => c.type === CERT_TYPE_BDID)
      const bvcCerts = certs.filter(c => c.type === CERT_TYPE_BVC)

      setHasBdid(bdidCerts.length > 0)
      setHasBvc(bvcCerts.length > 0)

      if (bvcCerts.length > 0) {
        setBvcCertificate(bvcCerts[0])
        setStep('dashboard')
      } else if (bdidCerts.length > 0) {
        setStep('form')
      }
    } catch (err) {
      console.warn('[WalletProvider] Failed to list certificates:', err)
    }
  }, [wallet])

  const connectWallet = useCallback(async () => {
    try {
      const client = new WalletClient()
      const { publicKey } = await client.getPublicKey({ identityKey: true })
      setWallet(client)
      setIdentityKey(publicKey)
      toast.success('Wallet connected')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Failed to connect wallet: ' + msg)
    }
  }, [])

  const logout = useCallback(() => {
    setBvcCertificate(null)
    setHasBvc(false)
    setStep('email')
    toast.success('Logged out')
  }, [])

  // Auto-connect on mount
  useEffect(() => {
    if (!wallet) connectWallet()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Check certificates when wallet connects
  useEffect(() => {
    if (wallet && identityKey && !hasChecked.current) {
      hasChecked.current = true
      checkCertificates()
    }
  }, [wallet, identityKey, checkCertificates])

  return (
    <WalletContext.Provider
      value={{
        wallet,
        identityKey,
        isConnected,
        hasBdid,
        hasBvc,
        bvcCertificate,
        step,
        setStep,
        connectWallet,
        checkCertificates,
        logout,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
