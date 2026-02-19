'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { WalletClient, Utils } from '@bsv/sdk'
import { toast } from 'react-hot-toast'
import config from '@/certifier.config'
import type { AppStep, WalletCertificate } from '@/lib/types'

interface WalletState {
  wallet: InstanceType<typeof WalletClient> | null
  identityKey: string | null
  isConnected: boolean
  hasDid: boolean
  /** Certificates keyed by certificate type base64 */
  certificates: Record<string, WalletCertificate | null>
  activeCertificate: WalletCertificate | null
  activeCertType: string | null
  setActiveCertType: (id: string | null) => void
  step: AppStep
  setStep: (step: AppStep) => void
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

/** DID certificate type — matches what the old code used */
const DID_CERT_TYPE = Utils.toBase64(Utils.toArray('Bdid', 'base64'))

function getInitialStep(): AppStep {
  const hasVerification = (config.verificationSteps ?? []).length > 0
  if (hasVerification) return 'verification'
  if (config.certificates.length > 1) return 'select'
  return 'form'
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<InstanceType<typeof WalletClient> | null>(null)
  const [identityKey, setIdentityKey] = useState<string | null>(null)
  const [hasDid, setHasDid] = useState(false)
  const [certificates, setCertificates] = useState<Record<string, WalletCertificate | null>>({})
  const [activeCertType, setActiveCertType] = useState<string | null>(null)
  const [step, setStep] = useState<AppStep>(getInitialStep())
  const hasChecked = useRef(false)

  const isConnected = !!wallet && !!identityKey

  // Derive activeCertificate from activeCertType
  const activeCertificate = activeCertType ? certificates[activeCertType] ?? null : null

  const checkCertificates = useCallback(async () => {
    if (!wallet || !SERVER_PUB_KEY) return
    try {
      // Collect all cert types to query (configured certs + DID if enabled)
      const typesToQuery: string[] = config.certificates.map(c => c.certificateTypeBase64)
      if (config.did?.enabled) {
        typesToQuery.push(DID_CERT_TYPE)
      }

      const result = await wallet.listCertificates({
        certifiers: [SERVER_PUB_KEY],
        types: typesToQuery,
      })

      let certs: WalletCertificate[] = []
      if (Array.isArray(result)) {
        certs = result as WalletCertificate[]
      } else if (result && typeof result === 'object' && 'certificates' in result) {
        certs = (result as { certificates: WalletCertificate[] }).certificates || []
      }

      // Check DID
      const didCerts = certs.filter(c => c.type === DID_CERT_TYPE)
      setHasDid(didCerts.length > 0)

      // Build certificates map
      const certMap: Record<string, WalletCertificate | null> = {}
      for (const certConfig of config.certificates) {
        const matching = certs.filter(c => c.type === certConfig.certificateTypeBase64)
        certMap[certConfig.certificateTypeBase64] = matching.length > 0 ? matching[0] : null
      }
      setCertificates(certMap)

      // Determine step based on found certificates
      // If any configured cert exists, go to dashboard
      const existingCert = config.certificates.find(
        cc => certMap[cc.certificateTypeBase64] !== null
      )
      if (existingCert) {
        setActiveCertType(existingCert.certificateTypeBase64)
        setStep('dashboard')
      } else if (didCerts.length > 0 || !config.did?.enabled) {
        // Has DID or DID not needed — go to form (or select if multiple)
        if (config.certificates.length > 1) {
          setStep('select')
        } else {
          setStep('form')
        }
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
    setActiveCertType(null)
    setCertificates({})
    setStep(getInitialStep())
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
        hasDid,
        certificates,
        activeCertificate,
        activeCertType,
        setActiveCertType,
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
