import { NextResponse } from 'next/server'
import { Certificate } from '@bsv/sdk'
import { getCertifierPubKey, checkRevocationStatus } from '@/lib/certifier'

export async function POST(req: Request) {
  try {
    const { certificate } = await req.json()

    if (!certificate) {
      return NextResponse.json({ error: 'certificate is required' }, { status: 400 })
    }

    // Validate structure
    const required = ['type', 'serialNumber', 'subject', 'certifier', 'revocationOutpoint', 'fields', 'signature']
    for (const field of required) {
      if (!certificate[field]) {
        return NextResponse.json({
          valid: false,
          error: `Missing required field: ${field}`,
        }, { status: 400 })
      }
    }

    // Verify the certifier matches our server
    const ourPubKey = await getCertifierPubKey()
    if (certificate.certifier !== ourPubKey) {
      return NextResponse.json({
        valid: false,
        error: 'Certificate was not issued by this certifier',
      })
    }

    // Verify signature
    const cert = new Certificate(
      certificate.type,
      certificate.serialNumber,
      certificate.subject,
      certificate.certifier,
      certificate.revocationOutpoint,
      certificate.fields
    )
    cert.signature = certificate.signature

    const isValid = await cert.verify()

    // Check on-chain revocation status
    const isRevoked = checkRevocationStatus(certificate.revocationOutpoint)

    return NextResponse.json({
      valid: isValid && !isRevoked,
      revoked: isRevoked,
      certifier: ourPubKey,
      subject: certificate.subject,
      type: certificate.type,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[/api/verify] Error:', message)
    return NextResponse.json({ valid: false, error: message }, { status: 500 })
  }
}
