import { ProtoWallet, PrivateKey, MasterCertificate } from '@bsv/sdk'

let _protoWallet: InstanceType<typeof ProtoWallet> | null = null
let _certifierPubKey: string | null = null

function getProtoWallet() {
  if (!_protoWallet) {
    const key = process.env.SERVER_PRIVATE_KEY
    if (!key) throw new Error('SERVER_PRIVATE_KEY not set')
    _protoWallet = new ProtoWallet(PrivateKey.fromHex(key))
  }
  return _protoWallet
}

export async function getCertifierPubKey(): Promise<string> {
  if (!_certifierPubKey) {
    const wallet = getProtoWallet()
    const { publicKey } = await wallet.getPublicKey({ identityKey: true })
    _certifierPubKey = publicKey
  }
  return _certifierPubKey
}

export async function issueCertificate(
  identityKey: string,
  fields: Record<string, string>,
  certType: string
) {
  const wallet = getProtoWallet()

  const masterCert = await MasterCertificate.issueCertificateForSubject(
    wallet,
    identityKey,
    fields,
    certType,
    async () => '00'.repeat(32) + '.0' // dummy revocation outpoint
  )

  return {
    type: masterCert.type,
    serialNumber: masterCert.serialNumber,
    subject: masterCert.subject,
    certifier: masterCert.certifier,
    revocationOutpoint: masterCert.revocationOutpoint,
    fields: masterCert.fields,
    signature: masterCert.signature,
    keyringForSubject: masterCert.masterKeyring,
  }
}
