import { NextResponse } from 'next/server'
import { issueCertificate } from '@/lib/certifier'
import { CERT_TYPE_BVC } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const { identityKey, fields, type } = await req.json()

    if (!identityKey) {
      return NextResponse.json({ error: 'identityKey is required' }, { status: 400 })
    }
    if (!fields || typeof fields !== 'object') {
      return NextResponse.json({ error: 'fields object is required' }, { status: 400 })
    }

    const certType = type || CERT_TYPE_BVC
    const result = await issueCertificate(identityKey, fields, certType)

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[/api/certify] Error:', message)
    return NextResponse.json({ error: 'Failed to issue certificate: ' + message }, { status: 500 })
  }
}
