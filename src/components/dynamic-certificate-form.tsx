'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Utils } from '@bsv/sdk'
import { toast } from 'react-hot-toast'
import { useWallet } from '@/components/wallet-provider'
import config from '@/certifier.config'
import type { CertificateTypeConfig, FieldSchema } from '@/lib/config-types'
import {
  countries,
  getCountryByCode,
  getProvincesForCountry,
  calculateAge,
  formatBirthdate,
  validateBirthdate,
} from '@/lib/geographic-data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** DID certificate type */
const DID_CERT_TYPE = Utils.toBase64(Utils.toArray('Bdid', 'base64'))

interface Props {
  certConfig: CertificateTypeConfig
  verifiedValues?: Record<string, string>
}

export default function DynamicCertificateForm({ certConfig, verifiedValues = {} }: Props) {
  const { wallet, identityKey, hasDid, checkCertificates } = useWallet()

  // Single state object for all field values
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const field of certConfig.fields) {
      initial[field.key] = verifiedValues[field.key] ?? ''
    }
    return initial
  })

  const [creatingDid, setCreatingDid] = useState(false)
  const [didCreated, setDidCreated] = useState(hasDid)
  const [generating, setGenerating] = useState(false)
  const autoDidAttempted = useRef(false)

  const didEnabled = config.did?.enabled ?? false
  const didAutoCreate = config.did?.autoCreate ?? false
  const didReady = !didEnabled || didCreated || hasDid

  // Inject verified values when they change
  useEffect(() => {
    if (Object.keys(verifiedValues).length > 0) {
      setValues(prev => ({ ...prev, ...verifiedValues }))
    }
  }, [verifiedValues])

  // Auto-create DID on mount if enabled
  useEffect(() => {
    if (didEnabled && didAutoCreate && !hasDid && wallet && identityKey && !autoDidAttempted.current) {
      autoDidAttempted.current = true
      createDid()
    }
  }, [hasDid, wallet, identityKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function setValue(key: string, value: string) {
    setValues(prev => {
      const next = { ...prev, [key]: value }
      // Reset province when country changes
      const field = certConfig.fields.find(f => f.key === key)
      if (field?.type === 'country-select') {
        const provinceField = certConfig.fields.find(f => f.type === 'province-select' && f.countryFieldKey === key)
        if (provinceField) {
          next[provinceField.key] = ''
        }
      }
      return next
    })
  }

  async function createDid() {
    if (!wallet || !identityKey || creatingDid) return
    setCreatingDid(true)
    try {
      const now = new Date().toISOString()
      const didId = `did:bsv:${identityKey.substring(0, 32)}`

      const fields: Record<string, string> = {
        didId,
        didType: 'identity',
        version: '1.0',
        created: now,
        updated: now,
        isDID: 'true',
        isVC: 'false',
      }

      const res = await fetch('/api/certify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityKey, fields, type: DID_CERT_TYPE }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Server returned ${res.status}`)
      }

      const certData = await res.json()

      await wallet.acquireCertificate({
        type: certData.type,
        certifier: certData.certifier,
        acquisitionProtocol: 'direct',
        fields: certData.fields,
        serialNumber: certData.serialNumber,
        revocationOutpoint: certData.revocationOutpoint,
        signature: certData.signature,
        keyringRevealer: 'certifier',
        keyringForSubject: certData.keyringForSubject,
      })

      setDidCreated(true)
      toast.success('DID created successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('DID creation failed: ' + msg)
    } finally {
      setCreatingDid(false)
    }
  }

  async function handleGenerateCert() {
    if (!wallet || !identityKey) {
      toast.error('Wallet not connected')
      return
    }

    // Run config validation
    if (certConfig.validate) {
      const error = certConfig.validate(values)
      if (error) {
        toast.error(error)
        return
      }
    } else {
      // Default: check required fields
      for (const field of certConfig.fields) {
        if (field.required && !values[field.key]?.trim()) {
          toast.error(`${field.label} is required`)
          return
        }
      }
    }

    setGenerating(true)
    try {
      // Merge computed fields
      const computed = certConfig.computedFields?.(values) ?? {}
      const allFields = { ...values, ...computed }

      const res = await fetch('/api/certify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityKey,
          fields: allFields,
          type: certConfig.certificateTypeBase64,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Server returned ${res.status}`)
      }

      const certData = await res.json()

      await wallet.acquireCertificate({
        type: certData.type,
        certifier: certData.certifier,
        acquisitionProtocol: 'direct',
        fields: certData.fields,
        serialNumber: certData.serialNumber,
        revocationOutpoint: certData.revocationOutpoint,
        signature: certData.signature,
        keyringRevealer: 'certifier',
        keyringForSubject: certData.keyringForSubject,
      })

      const txid = certData.revocationTxid || certData.revocationOutpoint?.split('.')[0]
      if (txid && txid !== '00'.repeat(32)) {
        toast.success(`Certificate issued! Revocation UTXO: ${txid.substring(0, 12)}...`, { duration: 5000 })
      } else {
        toast.success('Certificate generated!')
      }
      await checkCertificates()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Certificate generation failed: ' + msg)
    } finally {
      setGenerating(false)
    }
  }

  function renderField(field: FieldSchema) {
    const value = values[field.key] ?? ''

    switch (field.type) {
      case 'text':
      case 'number':
      case 'email':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Input
              id={field.key}
              type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text'}
              placeholder={field.placeholder}
              value={value}
              onChange={e => setValue(field.key, e.target.value)}
            />
            {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          </div>
        )

      case 'textarea':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <textarea
              id={field.key}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder={field.placeholder}
              value={value}
              onChange={e => setValue(field.key, e.target.value)}
            />
            {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          </div>
        )

      case 'date':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <div className="relative">
              <Input
                id={field.key}
                placeholder={field.format || 'DD/MM/YYYY'}
                value={value}
                onChange={e => setValue(field.key, formatBirthdate(e.target.value))}
                maxLength={10}
                className="pr-10"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
            {value && validateBirthdate(value) && (
              <p className="text-sm text-green-600 font-medium">Age: {calculateAge(value)} years old</p>
            )}
            {value && !validateBirthdate(value) && value.length > 0 && (
              <p className="text-sm text-red-600">Please enter a valid date in {field.format || 'DD/MM/YYYY'} format</p>
            )}
          </div>
        )

      case 'checkbox':
        return (
          <div key={field.key} className="flex items-center space-x-2">
            <input
              id={field.key}
              type="checkbox"
              checked={value === 'true'}
              onChange={e => setValue(field.key, e.target.checked ? 'true' : 'false')}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor={field.key}>{field.label}</Label>
          </div>
        )

      case 'select':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Select value={value} onValueChange={v => setValue(field.key, v)}>
              <SelectTrigger>
                <SelectValue placeholder={field.placeholder || `Select ${field.label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {(field.options ?? []).map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          </div>
        )

      case 'country-select':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Select value={value} onValueChange={v => setValue(field.key, v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select your country" />
              </SelectTrigger>
              <SelectContent>
                {countries.map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )

      case 'province-select': {
        const countryKey = field.countryFieldKey || 'country'
        const countryCode = values[countryKey] ?? ''
        const countryData = getCountryByCode(countryCode)
        const provinces = getProvincesForCountry(countryCode)

        if (!countryData?.hasProvinces) return null

        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{countryData.regionLabel || field.label}</Label>
            <Select value={value} onValueChange={v => setValue(field.key, v)}>
              <SelectTrigger>
                <SelectValue placeholder={`Select your ${(countryData.regionLabel || 'region').toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {provinces.map(p => (
                  <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      }

      default:
        return null
    }
  }

  // Group fields if fieldGroups is defined
  function renderFields() {
    if (certConfig.fieldGroups && certConfig.fieldGroups.length > 0) {
      const grouped: Record<string, FieldSchema[]> = {}
      const ungrouped: FieldSchema[] = []
      for (const field of certConfig.fields) {
        if (field.group) {
          if (!grouped[field.group]) grouped[field.group] = []
          grouped[field.group].push(field)
        } else {
          ungrouped.push(field)
        }
      }

      return (
        <>
          {ungrouped.map(f => renderField(f))}
          {certConfig.fieldGroups.map(group => {
            const fields = grouped[group.key]
            if (!fields || fields.length === 0) return null

            // Check if group starts with two text fields side-by-side (like first/last name)
            const firstTwo = fields.slice(0, 2)
            const canGrid = firstTwo.length === 2 &&
              (firstTwo[0].type === 'text' || firstTwo[0].type === 'email') &&
              (firstTwo[1].type === 'text' || firstTwo[1].type === 'email')

            return (
              <div key={group.key} className="pt-4 border-t">
                <h3 className="text-lg font-medium mb-4">{group.label}</h3>
                {canGrid && (
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {firstTwo.map(f => renderField(f))}
                  </div>
                )}
                <div className="space-y-4">
                  {(canGrid ? fields.slice(2) : fields).map(f => renderField(f))}
                </div>
              </div>
            )
          })}
        </>
      )
    }

    // No groups — render all fields flat, with first two in a grid if they're simple text
    const firstTwo = certConfig.fields.slice(0, 2)
    const canGrid = firstTwo.length === 2 &&
      (firstTwo[0].type === 'text' || firstTwo[0].type === 'email') &&
      (firstTwo[1].type === 'text' || firstTwo[1].type === 'email')

    return (
      <>
        {canGrid && (
          <div className="grid grid-cols-2 gap-4">
            {firstTwo.map(f => renderField(f))}
          </div>
        )}
        {(canGrid ? certConfig.fields.slice(2) : certConfig.fields).map(f => renderField(f))}
      </>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">{certConfig.name}</CardTitle>
        {certConfig.description && (
          <p className="text-muted-foreground text-center">{certConfig.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {didEnabled && creatingDid && (
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
            <div className="flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              <span className="text-blue-700 font-medium">Creating your DID automatically...</span>
            </div>
            <p className="text-blue-600 text-sm mt-1">Please wait while we set up your digital identity.</p>
          </div>
        )}

        {didReady && renderFields()}

        <div className="space-y-3 pt-4">
          {didEnabled && !didCreated && !hasDid && !creatingDid && (
            <Button onClick={createDid} className="w-full">
              Retry DID Creation
            </Button>
          )}
          <Button
            onClick={handleGenerateCert}
            disabled={!didReady || generating}
            variant={!didReady ? 'secondary' : 'default'}
            className="w-full"
          >
            {generating ? 'Generating...' : 'Generate Certificate'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
