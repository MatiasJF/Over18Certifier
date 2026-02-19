import { NextRequest, NextResponse } from 'next/server'
import { createPaymentRequest, receivePayment, getWalletBalance, getCertifierPubKey } from '@/lib/certifier'

/**
 * GET  ?action=request&satoshis=10000  → BRC-29 payment request
 * GET  ?action=balance                 → Wallet balance
 * POST ?action=receive                 → Internalize incoming BRC-29 payment
 */

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') || 'balance'

  try {
    if (action === 'balance') {
      const balance = await getWalletBalance()
      const identityKey = await getCertifierPubKey()
      return NextResponse.json({ success: true, identityKey, ...balance })
    }

    if (action === 'request') {
      const satoshis = parseInt(req.nextUrl.searchParams.get('satoshis') || '10000', 10)
      if (isNaN(satoshis) || satoshis < 1) {
        return NextResponse.json({ success: false, error: 'Invalid satoshis parameter' }, { status: 400 })
      }
      const request = await createPaymentRequest(satoshis)
      return NextResponse.json({ success: true, paymentRequest: request })
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `${action} failed: ${(error as Error).message}`
    }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') || 'receive'

  try {
    if (action === 'receive') {
      const body = await req.json()
      const { tx, senderIdentityKey, derivationPrefix, derivationSuffix, outputIndex } = body

      if (!tx || !senderIdentityKey || !derivationPrefix || !derivationSuffix) {
        return NextResponse.json({
          success: false,
          error: 'Missing required fields: tx, senderIdentityKey, derivationPrefix, derivationSuffix'
        }, { status: 400 })
      }

      await receivePayment({
        tx,
        senderIdentityKey,
        derivationPrefix,
        derivationSuffix,
        outputIndex: outputIndex ?? 0
      })

      const identityKey = await getCertifierPubKey()
      return NextResponse.json({
        success: true,
        message: 'Payment internalized successfully',
        serverIdentityKey: identityKey
      })
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `receive failed: ${(error as Error).message}`
    }, { status: 500 })
  }
}
