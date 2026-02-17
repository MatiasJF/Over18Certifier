import { NextResponse } from 'next/server'
import { TransactionalEmailsApi, TransactionalEmailsApiApiKeys } from '@getbrevo/brevo'

// In-memory verification code store with TTL
const codes = new Map<string, { code: number; expires: number }>()

// Clean expired entries periodically
function cleanExpired() {
  const now = Date.now()
  for (const [key, val] of codes) {
    if (now > val.expires) codes.delete(key)
  }
}

// Brevo mailer setup
const brevoAPIKey = process.env.BREVO_API_KEY?.trim() || ''
const mailer = new TransactionalEmailsApi()
if (brevoAPIKey) {
  mailer.setApiKey(TransactionalEmailsApiApiKeys.apiKey, brevoAPIKey)
}
const emailSender = process.env.SENDER_EMAIL?.trim() || 'noreply@example.com'

export async function POST(req: Request) {
  try {
    const { email, code, type } = await req.json()

    if (type === 'sendEmail') {
      // Store code with 10-minute TTL
      codes.set(email, { code: Number(code), expires: Date.now() + 600_000 })

      // Send via Brevo
      const message = {
        sender: { name: 'Over18Certifier', email: emailSender },
        to: [{ email, name: 'User' }],
        subject: 'Your verification code',
        htmlContent: `<html><body><h1>Verification code: ${code}</h1></body></html>`,
      }

      const res = await mailer.sendTransacEmail(message)
      const messageId = (res as { body?: { messageId?: string } })?.body?.messageId

      if (typeof messageId === 'string' && messageId.trim().length > 0) {
        return NextResponse.json({ sentStatus: true, messageId })
      }
      return NextResponse.json({ sentStatus: false }, { status: 400 })
    }

    if (type === 'verifyCode') {
      cleanExpired()
      const stored = codes.get(email)
      if (!stored) {
        return NextResponse.json({ verificationStatus: false, message: 'Code not found' }, { status: 400 })
      }
      if (Date.now() > stored.expires) {
        codes.delete(email)
        return NextResponse.json({ verificationStatus: false, message: 'Code expired' }, { status: 400 })
      }
      if (Number(code) !== stored.code) {
        return NextResponse.json({ verificationStatus: false, message: 'Code mismatch' }, { status: 400 })
      }
      return NextResponse.json({ verificationStatus: true })
    }

    if (type === 'delete-on-verified') {
      codes.delete(email)
      return NextResponse.json({ deletedStatus: true })
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (error) {
    console.error('[/api/email] Error:', error)
    return NextResponse.json({ verificationStatus: false, message: 'Something went wrong' }, { status: 400 })
  }
}
