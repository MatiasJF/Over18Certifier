import { NextResponse } from 'next/server'
import { issueCertificate } from '@/lib/certifier'
import config from '@/certifier.config'
import { Utils } from '@bsv/sdk'

/** DID certificate type — always allowed */
const DID_CERT_TYPE = Utils.toBase64(Utils.toArray('Bdid', 'base64'))

/** Set of valid certificate types from config */
const validTypes = new Set([
  ...config.certificates.map(c => c.certificateTypeBase64),
  ...(config.did?.enabled ? [DID_CERT_TYPE] : []),
])

export async function POST(req: Request) {
  try {
    const { identityKey, fields, type } = await req.json()

    if (!identityKey) {
      return NextResponse.json({ error: 'identityKey is required' }, { status: 400 })
    }
    if (!fields || typeof fields !== 'object') {
      return NextResponse.json({ error: 'fields object is required' }, { status: 400 })
    }
    if (!type) {
      return NextResponse.json({ error: 'type is required' }, { status: 400 })
    }

    // Validate the cert type is one we're configured to issue
    if (!validTypes.has(type)) {
      return NextResponse.json({ error: 'Unknown certificate type' }, { status: 400 })
    }

    // For non-DID types, validate required fields against config
    if (type !== DID_CERT_TYPE) {
      const certConfig = config.certificates.find(c => c.certificateTypeBase64 === type)
      if (certConfig) {
        for (const field of certConfig.fields) {
          if (field.required && !fields[field.key]?.trim?.()) {
            return NextResponse.json(
              { error: `Missing required field: ${field.label}` },
              { status: 400 }
            )
          }
        }
      }
    }

    const result = await issueCertificate(identityKey, fields, type)

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[/api/certify] Error:', message)
    const status = message.includes('not funded') ? 503 : 500
    return NextResponse.json({ error: 'Failed to issue certificate: ' + message }, { status })
  }
}
