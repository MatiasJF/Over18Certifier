'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Utils } from '@bsv/sdk'
import { toast } from 'react-hot-toast'
import { useWallet } from '@/components/wallet-provider'
import { CERT_TYPE_BDID, CERT_TYPE_BVC } from '@/lib/types'
import {
  countries,
  getCountryByCode,
  getProvincesForCountry,
  calculateAge,
  isOver18,
  formatBirthdate,
  validateBirthdate,
} from '@/lib/geographic-data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  verifiedEmail: string
}

export default function IdentityForm({ verifiedEmail }: Props) {
  const { wallet, identityKey, hasBdid, checkCertificates } = useWallet()

  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [gender, setGender] = useState('')
  const [email, setEmail] = useState(verifiedEmail)
  const [occupation, setOccupation] = useState('')
  const [country, setCountry] = useState('')
  const [provinceState, setProvinceState] = useState('')
  const [city, setCity] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [postalCode, setPostalCode] = useState('')

  // UI state
  const [creatingDid, setCreatingDid] = useState(false)
  const [didCreated, setDidCreated] = useState(hasBdid)
  const [generating, setGenerating] = useState(false)
  const autoDidAttempted = useRef(false)

  const selectedCountry = getCountryByCode(country)
  const availableProvinces = getProvincesForCountry(country)

  // Auto-create DID on mount if user doesn't have one
  useEffect(() => {
    if (!hasBdid && wallet && identityKey && !autoDidAttempted.current) {
      autoDidAttempted.current = true
      createDid()
    }
  }, [hasBdid, wallet, identityKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
        body: JSON.stringify({
          identityKey,
          fields,
          type: CERT_TYPE_BDID,
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

    // Validate all fields
    if (!firstName.trim()) return toast.error('First name is required')
    if (!lastName.trim()) return toast.error('Last name is required')
    if (!birthdate.trim() || !validateBirthdate(birthdate)) return toast.error('Valid birthdate (DD/MM/YYYY) is required')
    if (!gender.trim()) return toast.error('Gender is required')
    if (!email.trim()) return toast.error('Email is required')
    if (!occupation.trim()) return toast.error('Occupation is required')
    if (!country.trim()) return toast.error('Country is required')
    if (!city.trim()) return toast.error('City is required')
    if (!streetAddress.trim()) return toast.error('Street address is required')
    if (!postalCode.trim()) return toast.error('Postal code is required')

    if (selectedCountry?.hasProvinces && !provinceState.trim()) {
      return toast.error(`${selectedCountry.regionLabel} is required`)
    }

    const userIsOver18 = isOver18(birthdate)
    if (userIsOver18 === null) return toast.error('Invalid birthdate')
    if (!userIsOver18) return toast.error('You must be 18 or older')

    setGenerating(true)
    try {
      const countryName = getCountryByCode(country)?.name || country
      const fields: Record<string, string> = {
        firstName,
        lastName,
        birthdate,
        over18: 'true',
        gender,
        email,
        occupation,
        country,
        provinceState,
        city,
        streetAddress,
        postalCode,
        username: `${firstName} ${lastName}`.trim(),
        residence: `${city}, ${countryName}`.trim(),
        work: occupation,
        isVC: 'true',
        isDID: 'false',
      }

      const res = await fetch('/api/certify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityKey,
          fields,
          type: CERT_TYPE_BVC,
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

      toast.success('Identity certificate generated!')
      await checkCertificates()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Certificate generation failed: ' + msg)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">User Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {creatingDid && (
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
            <div className="flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              <span className="text-blue-700 font-medium">Creating your DID automatically...</span>
            </div>
            <p className="text-blue-600 text-sm mt-1">Please wait while we set up your digital identity.</p>
          </div>
        )}

        {(didCreated || hasBdid) && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" placeholder="Enter first name" value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" placeholder="Enter last name" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="birthdate">Birthdate</Label>
              <div className="relative">
                <Input
                  id="birthdate"
                  placeholder="DD/MM/YYYY"
                  value={birthdate}
                  onChange={e => setBirthdate(formatBirthdate(e.target.value))}
                  maxLength={10}
                  className="pr-10"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Enter your date of birth in DD/MM/YYYY format</p>
              {birthdate && validateBirthdate(birthdate) && (
                <p className="text-sm text-green-600 font-medium">Age: {calculateAge(birthdate)} years old</p>
              )}
              {birthdate && !validateBirthdate(birthdate) && birthdate.length > 0 && (
                <p className="text-sm text-red-600">Please enter a valid date in DD/MM/YYYY format</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Input id="gender" placeholder="Enter your gender" value={gender} onChange={e => setGender(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="Enter your email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="occupation">Occupation</Label>
              <Input id="occupation" placeholder="Enter your occupation" value={occupation} onChange={e => setOccupation(e.target.value)} />
            </div>

            <div className="pt-4 border-t">
              <h3 className="text-lg font-medium mb-4">Address Information</h3>

              <div className="space-y-2 mb-4">
                <Label htmlFor="country">Country</Label>
                <Select value={country} onValueChange={v => { setCountry(v); setProvinceState('') }}>
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

              {selectedCountry?.hasProvinces && (
                <div className="space-y-2 mb-4">
                  <Label htmlFor="provinceState">{selectedCountry.regionLabel || 'Region'}</Label>
                  <Select value={provinceState} onValueChange={setProvinceState}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select your ${(selectedCountry.regionLabel || 'region').toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProvinces.map(p => (
                        <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2 mb-4">
                <Label htmlFor="city">City</Label>
                <Input id="city" placeholder="Enter your city" value={city} onChange={e => setCity(e.target.value)} />
              </div>

              <div className="space-y-2 mb-4">
                <Label htmlFor="streetAddress">Street Address</Label>
                <Input id="streetAddress" placeholder="Enter your street address" value={streetAddress} onChange={e => setStreetAddress(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="postalCode">{selectedCountry?.postalLabel || 'Postal Code'}</Label>
                <Input
                  id="postalCode"
                  placeholder={`Enter your ${(selectedCountry?.postalLabel || 'postal code').toLowerCase()}`}
                  value={postalCode}
                  onChange={e => setPostalCode(e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        <div className="space-y-3 pt-4">
          {!didCreated && !hasBdid && !creatingDid && (
            <Button onClick={createDid} className="w-full">
              Retry DID Creation
            </Button>
          )}
          <Button
            onClick={handleGenerateCert}
            disabled={(!didCreated && !hasBdid) || generating}
            variant={(!didCreated && !hasBdid) ? 'secondary' : 'default'}
            className="w-full"
          >
            {generating ? 'Generating...' : 'Generate Certificate'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
