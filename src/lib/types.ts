import { Utils } from '@bsv/sdk'

// Certificate type constants
export const CERT_TYPE_BDID = Utils.toBase64(Utils.toArray('Bdid', 'base64'))
export const CERT_TYPE_BVC = Utils.toBase64(Utils.toArray('Bvc', 'base64'))

// UI step routing
export type CertStep = 'email' | 'form' | 'dashboard'

// Certificate field interfaces
export interface BdidFields {
  didId: string
  didType: string
  version: string
  created: string
  updated: string
  isDID: 'true'
  isVC: 'false'
}

export interface BvcFields {
  firstName: string
  lastName: string
  birthdate: string
  over18: string
  gender: string
  email: string
  occupation: string
  country: string
  provinceState: string
  city: string
  streetAddress: string
  postalCode: string
  isVC: 'true'
  isDID: 'false'
  // Legacy compat
  username?: string
  residence?: string
  work?: string
  didRef?: string
}

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
