// UI step routing
export type AppStep = 'verification' | 'select' | 'form' | 'dashboard'

// API request/response types
export interface CertifyRequest {
  identityKey: string
  fields: Record<string, string>
  type: string
}

export interface CertifyResponse {
  type: string
  serialNumber: string
  subject: string
  certifier: string
  revocationOutpoint: string
  fields: Record<string, string>
  signature: string
  keyringForSubject: Record<string, string>
}

// Wallet certificate from listCertificates
export interface WalletCertificate {
  type: string
  serialNumber: string
  subject: string
  certifier: string
  revocationOutpoint: string
  fields: Record<string, string>
  signature?: string
}
