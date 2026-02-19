import { NextResponse } from 'next/server'
import { revokeCertificate } from '@/lib/certifier'

export async function POST(req: Request) {
  try {
    const { certificate } = await req.json()

    if (!certificate?.serialNumber) {
      return NextResponse.json({ error: 'Invalid certificate' }, { status: 400 })
    }

    const result = await revokeCertificate(certificate.serialNumber)
    console.log('[/api/revoke] Certificate revoked on-chain:', certificate.serialNumber.substring(0, 16), 'txid:', result.txid)

    return NextResponse.json({ message: 'Certificate revoked on-chain', txid: result.txid })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[/api/revoke] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
