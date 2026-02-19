/** Field types supported in dynamic certificate forms */
export type FieldType =
  | 'text'
  | 'email'
  | 'date'
  | 'number'
  | 'textarea'
  | 'checkbox'
  | 'select'
  | 'country-select'
  | 'province-select'

/** Schema for a single form field */
export interface FieldSchema {
  key: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  /** For 'date' fields — e.g. 'DD/MM/YYYY' */
  format?: string
  /** For 'select' fields — static options */
  options?: { value: string; label: string }[]
  /** Group name for visual grouping with section headers */
  group?: string
  /** Help text shown below the field */
  helpText?: string
  /**
   * For 'province-select' — the key of the country-select field
   * that drives which provinces are shown
   */
  countryFieldKey?: string
}

/** Verification step configuration (e.g. email verification) */
export interface VerificationStep {
  type: 'email'
  required: boolean
  /** Field key into which the verified value is injected */
  injectsField: string
  /** Label shown on the verification step */
  label?: string
}

/** Branding configuration */
export interface BrandingConfig {
  appName: string
  description?: string
  primaryColor?: string
  accentColor?: string
}

/** DID auto-creation configuration */
export interface DidConfig {
  enabled: boolean
  autoCreate: boolean
}

/** Dashboard display configuration per certificate type */
export interface DashboardConfig {
  successTitle?: string
  successDescription?: string
  returnUrlLabel?: string
  returnUrlAutoRedirect?: boolean
}

/** Configuration for a single certificate type */
export interface CertificateTypeConfig {
  id: string
  name: string
  description?: string
  certificateTypeBase64: string
  fields: FieldSchema[]
  /** Named groups for rendering section headers */
  fieldGroups?: { key: string; label: string }[]
  /** Custom validation — return error message or null */
  validate?: (values: Record<string, string>) => string | null
  /** Compute additional fields to merge into the certificate */
  computedFields?: (values: Record<string, string>) => Record<string, string>
  /** Dashboard display settings */
  dashboard?: DashboardConfig
}

/** Root certifier configuration — deployers edit this one object */
export interface CertifierConfig {
  branding: BrandingConfig
  verificationSteps?: VerificationStep[]
  did?: DidConfig
  certificates: CertificateTypeConfig[]
}
