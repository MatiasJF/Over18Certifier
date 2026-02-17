import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { certificate } = await req.json()

    if (!certificate?.serialNumber) {
      return NextResponse.json({ error: 'Invalid certificate' }, { status: 400 })
    }

    // Certificate revocation is handled client-side via wallet.relinquishCertificate()
    // This endpoint is a placeholder for server-side revocation tracking if needed later
    console.log('[/api/revoke] Certificate revoked:', certificate.serialNumber.substring(0, 16))

    return NextResponse.json({ message: 'Certificate revocation acknowledged' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[/api/revoke] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
