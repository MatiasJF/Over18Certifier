import { Utils } from '@bsv/sdk'
import type { CertifierConfig } from '@/lib/config-types'
import { isOver18, getCountryByCode } from '@/lib/geographic-data'

const config: CertifierConfig = {
  branding: {
    appName: 'Over18Certifier',
    description: 'Generate BSV-based digital identity certificates with DIDs and VCs',
  },

  verificationSteps: [
    {
      type: 'email',
      required: false,
      injectsField: 'email',
      label: 'Certify your identity using your email address',
    },
  ],

  did: {
    enabled: true,
    autoCreate: true,
  },

  certificates: [
    {
      id: 'bvc',
      name: 'Identity Certificate',
      description: 'Verifiable credential proving you are over 18',
      certificateTypeBase64: Utils.toBase64(Utils.toArray('Bvc', 'base64')),
      fieldGroups: [
        { key: 'personal', label: 'Personal Information' },
        { key: 'address', label: 'Address Information' },
      ],
      fields: [
        { key: 'firstName', label: 'First Name', type: 'text', required: true, placeholder: 'Enter first name', group: 'personal' },
        { key: 'lastName', label: 'Last Name', type: 'text', required: true, placeholder: 'Enter last name', group: 'personal' },
        { key: 'birthdate', label: 'Birthdate', type: 'date', required: true, format: 'DD/MM/YYYY', helpText: 'Enter your date of birth in DD/MM/YYYY format', group: 'personal' },
        { key: 'gender', label: 'Gender', type: 'text', required: true, placeholder: 'Enter your gender', group: 'personal' },
        { key: 'email', label: 'Email', type: 'email', required: true, placeholder: 'Enter your email', group: 'personal' },
        { key: 'occupation', label: 'Occupation', type: 'text', required: true, placeholder: 'Enter your occupation', group: 'personal' },
        { key: 'country', label: 'Country', type: 'country-select', required: true, group: 'address' },
        { key: 'provinceState', label: 'Province/State', type: 'province-select', required: false, countryFieldKey: 'country', group: 'address' },
        { key: 'city', label: 'City', type: 'text', required: true, placeholder: 'Enter your city', group: 'address' },
        { key: 'streetAddress', label: 'Street Address', type: 'text', required: true, placeholder: 'Enter your street address', group: 'address' },
        { key: 'postalCode', label: 'Postal Code', type: 'text', required: true, placeholder: 'Enter your postal code', group: 'address' },
      ],
      validate: (values) => {
        if (!values.firstName?.trim()) return 'First name is required'
        if (!values.lastName?.trim()) return 'Last name is required'
        if (!values.birthdate?.trim()) return 'Birthdate is required'
        const over18 = isOver18(values.birthdate)
        if (over18 === null) return 'Invalid birthdate'
        if (!over18) return 'You must be 18 or older'
        if (!values.gender?.trim()) return 'Gender is required'
        if (!values.email?.trim()) return 'Email is required'
        if (!values.occupation?.trim()) return 'Occupation is required'
        if (!values.country?.trim()) return 'Country is required'
        if (!values.city?.trim()) return 'City is required'
        if (!values.streetAddress?.trim()) return 'Street address is required'
        if (!values.postalCode?.trim()) return 'Postal code is required'
        // Check province requirement dynamically
        const countryData = getCountryByCode(values.country)
        if (countryData?.hasProvinces && !values.provinceState?.trim()) {
          return `${countryData.regionLabel || 'Region'} is required`
        }
        return null
      },
      computedFields: (values) => {
        const countryName = getCountryByCode(values.country)?.name || values.country
        return {
          over18: 'true',
          username: `${values.firstName} ${values.lastName}`.trim(),
          residence: `${values.city}, ${countryName}`.trim(),
          work: values.occupation,
          isVC: 'true',
          isDID: 'false',
        }
      },
      dashboard: {
        successTitle: 'Welcome Back!',
        successDescription: 'You are successfully logged in with your certificate.',
        returnUrlLabel: 'Return',
        returnUrlAutoRedirect: true,
      },
    },
  ],
}

export default config
