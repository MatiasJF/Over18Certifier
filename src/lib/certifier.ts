import {
  PrivateKey,
  KeyDeriver,
  Hash,
  Script,
  OP,
  Utils,
  Random,
  MasterCertificate
} from '@bsv/sdk'
import {
  Wallet as ToolboxWallet,
  WalletStorageManager,
  WalletSigner,
  Services,
  StorageClient
} from '@bsv/wallet-toolbox'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Wallet singleton (async init required for StorageClient)
// ---------------------------------------------------------------------------

let _wallet: ToolboxWallet | null = null
let _initPromise: Promise<ToolboxWallet> | null = null
let _identityKey: string | null = null

async function getWallet(): Promise<ToolboxWallet> {
  if (_wallet) return _wallet
  if (_initPromise) return _initPromise
  _initPromise = initWallet()
  return _initPromise
}

async function initWallet(): Promise<ToolboxWallet> {
  const key = process.env.SERVER_PRIVATE_KEY
  if (!key) throw new Error('SERVER_PRIVATE_KEY not set')

  const privateKey = PrivateKey.fromHex(key)
  const keyDeriver = new KeyDeriver(privateKey)
  _identityKey = keyDeriver.identityKey

  const chain = (process.env.CHAIN || 'main') as 'main' | 'test'
  const storageManager = new WalletStorageManager(keyDeriver.identityKey)
  const signer = new WalletSigner(chain, keyDeriver, storageManager)
  const services = new Services(chain)
  const wallet = new ToolboxWallet(signer, services)

  const storageUrl = process.env.WALLET_STORAGE_URL || 'https://storage.babbage.systems'
  const storageClient = new StorageClient(wallet, storageUrl)
  await storageClient.makeAvailable()
  await storageManager.addWalletStorageProvider(storageClient)

  _wallet = wallet
  return wallet
}

// ---------------------------------------------------------------------------
// Revocation secret persistence (.revocation-secrets.json)
// ---------------------------------------------------------------------------

interface RevocationRecord {
  secret: string   // hex-encoded 32-byte preimage
  outpoint: string // "txid.outputIndex"
  beef: number[]   // BEEF tx bytes from createAction (needed for spending)
}

const SECRETS_FILE = join(process.cwd(), '.revocation-secrets.json')

let _writeMutex: Promise<void> = Promise.resolve()

function loadSecrets(): Record<string, RevocationRecord> {
  try {
    if (existsSync(SECRETS_FILE)) {
      return JSON.parse(readFileSync(SECRETS_FILE, 'utf-8'))
    }
  } catch {}
  return {}
}

function saveSecrets(records: Record<string, RevocationRecord>): void {
  writeFileSync(SECRETS_FILE, JSON.stringify(records, null, 2))
}

async function withSecretsLock<T>(fn: (records: Record<string, RevocationRecord>) => T): Promise<T> {
  const prev = _writeMutex
  let resolve: () => void
  _writeMutex = new Promise<void>(r => { resolve = r })
  await prev
  try {
    const records = loadSecrets()
    const result = fn(records)
    saveSecrets(records)
    return result
  } finally {
    resolve!()
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getCertifierPubKey(): Promise<string> {
  if (_identityKey) return _identityKey
  await getWallet()
  return _identityKey!
}

export async function getWalletBalance(): Promise<{
  totalOutputs: number
  totalSatoshis: number
  spendableOutputs: number
  spendableSatoshis: number
}> {
  const wallet = await getWallet()
  const raw = await wallet.listOutputs({
    basket: 'default',
    include: 'locking scripts'
  })

  const outputList = raw?.outputs ?? (Array.isArray(raw) ? raw : [])
  const totalSatoshis = outputList.reduce((sum: number, o: any) => sum + (o.satoshis || 0), 0)
  const spendable = outputList.filter((o: any) => o.spendable !== false)
  const spendableSatoshis = spendable.reduce((sum: number, o: any) => sum + (o.satoshis || 0), 0)

  return {
    totalOutputs: outputList.length,
    totalSatoshis,
    spendableOutputs: spendable.length,
    spendableSatoshis
  }
}

/**
 * Create a 1-sat hash-locked UTXO for certificate revocation.
 *
 * Locking script: OP_SHA256 <hash> OP_EQUAL
 * Anyone who reveals the 32-byte preimage can spend it.
 */
async function createRevocationUtxo(wallet: ToolboxWallet): Promise<{
  outpoint: string
  secret: string
  beef: number[]
}> {
  const secretBytes = Random(32)
  const secret = Utils.toHex(secretBytes)
  const hashBytes = Hash.sha256(secretBytes)

  const lockingScript = new Script()
    .writeOpCode(OP.OP_SHA256)
    .writeBin(Array.from(hashBytes))
    .writeOpCode(OP.OP_EQUAL)

  const result = await wallet.createAction({
    description: 'Certificate revocation UTXO',
    outputs: [{
      lockingScript: lockingScript.toHex(),
      satoshis: 1,
      outputDescription: 'Revocation hash-lock',
      basket: 'revocation-utxos',
      tags: ['revocation']
    }],
    options: { randomizeOutputs: false }
  })

  if (!result.txid) {
    throw new Error('createAction did not return a txid — wallet may not be funded')
  }

  // Save BEEF bytes so we can provide them when spending this UTXO
  const beef = result.tx ? Array.from(result.tx) : []

  const outpoint = `${result.txid}.0`
  return { outpoint, secret, beef }
}

export async function issueCertificate(
  identityKey: string,
  fields: Record<string, string>,
  certType: string
) {
  const wallet = await getWallet()

  // Create revocation UTXO first (closure-scoped for concurrency safety)
  let pendingOutpoint: string
  let pendingSecret: string
  let pendingBeef: number[]

  try {
    const utxo = await createRevocationUtxo(wallet)
    pendingOutpoint = utxo.outpoint
    pendingSecret = utxo.secret
    pendingBeef = utxo.beef
  } catch (error) {
    const msg = (error as Error).message
    if (msg.includes('not enough funds') || msg.includes('not funded') || msg.includes('ERR_NOT_SUFFICIENT_FUNDS')) {
      throw new Error('Certifier wallet not funded. Use /api/fund to add funds before issuing certificates.')
    }
    throw error
  }

  // Issue certificate — the callback returns our real on-chain outpoint
  const masterCert = await MasterCertificate.issueCertificateForSubject(
    wallet,
    identityKey,
    fields,
    certType,
    async () => pendingOutpoint
  )

  // Persist the secret keyed by serial number
  await withSecretsLock(records => {
    records[masterCert.serialNumber] = {
      secret: pendingSecret,
      outpoint: pendingOutpoint,
      beef: pendingBeef
    }
  })

  // Extract txid from outpoint for display
  const revocationTxid = pendingOutpoint.split('.')[0]

  return {
    type: masterCert.type,
    serialNumber: masterCert.serialNumber,
    subject: masterCert.subject,
    certifier: masterCert.certifier,
    revocationOutpoint: masterCert.revocationOutpoint,
    revocationTxid,
    fields: masterCert.fields,
    signature: masterCert.signature,
    keyringForSubject: masterCert.masterKeyring,
  }
}

/**
 * Revoke a certificate by spending its on-chain revocation UTXO.
 *
 * The unlocking script pushes the 32-byte SHA-256 preimage that satisfies
 * the OP_SHA256 <hash> OP_EQUAL locking script.
 */
export async function revokeCertificate(serialNumber: string): Promise<{ txid: string }> {
  const wallet = await getWallet()

  // Load the record (don't delete yet — only after successful spend)
  let record: RevocationRecord | undefined
  const records = loadSecrets()
  record = records[serialNumber]

  if (!record) {
    throw new Error('Certificate already revoked or not found')
  }

  const secretBytes = Utils.toArray(record.secret, 'hex')

  // Build unlocking script: just push the preimage
  const unlockingScript = new Script().writeBin(secretBytes).toHex()

  const result = await wallet.createAction({
    description: 'Revoke certificate',
    inputBEEF: record.beef.length > 0 ? record.beef : undefined,
    inputs: [{
      outpoint: record.outpoint,
      unlockingScript,
      inputDescription: 'Spend revocation UTXO'
    }],
    outputs: [],
    options: { randomizeOutputs: false }
  })

  if (!result.txid) {
    throw new Error('Revocation transaction failed — no txid returned')
  }

  // Only delete after successful spend
  await withSecretsLock(recs => {
    delete recs[serialNumber]
  })

  return { txid: result.txid }
}

/**
 * Check if a certificate's revocation UTXO has been spent.
 *
 * - Dummy outpoint ('00'.repeat(32) + '.0') → not revoked (backward compat)
 * - Record exists in storage → UTXO is unspent → not revoked
 * - Record NOT found → UTXO was spent → certificate IS revoked
 */
export function checkRevocationStatus(revocationOutpoint: string): boolean {
  // Backward compat: dummy outpoints are never considered revoked
  if (revocationOutpoint === '00'.repeat(32) + '.0') {
    return false
  }

  const records = loadSecrets()
  // If we still have the secret, the UTXO is unspent → not revoked
  const found = Object.values(records).some(r => r.outpoint === revocationOutpoint)
  return !found // true = revoked (record gone), false = not revoked (record present)
}

/**
 * Create a BRC-29 payment request for funding the certifier wallet.
 */
export async function createPaymentRequest(satoshis: number): Promise<{
  serverIdentityKey: string
  derivationPrefix: string
  derivationSuffix: string
  satoshis: number
}> {
  await getWallet()
  const derivationPrefix = Utils.toBase64(Utils.toArray('payment', 'utf8'))
  const derivationSuffix = Utils.toBase64(Random(8))

  return {
    serverIdentityKey: _identityKey!,
    derivationPrefix,
    derivationSuffix,
    satoshis
  }
}

/**
 * Internalize an incoming BRC-29 payment into the certifier wallet.
 */
export async function receivePayment(params: {
  tx: number[]
  senderIdentityKey: string
  derivationPrefix: string
  derivationSuffix: string
  outputIndex?: number
}): Promise<void> {
  const wallet = await getWallet()

  await wallet.internalizeAction({
    tx: params.tx,
    outputs: [{
      outputIndex: params.outputIndex ?? 0,
      protocol: 'wallet payment',
      paymentRemittance: {
        senderIdentityKey: params.senderIdentityKey,
        derivationPrefix: params.derivationPrefix,
        derivationSuffix: params.derivationSuffix
      }
    }],
    description: `Funding from ${params.senderIdentityKey.substring(0, 20)}...`,
    labels: ['certifier_funding']
  })
}
