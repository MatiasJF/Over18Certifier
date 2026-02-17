# Over18Certifier

A BSV blockchain-based identity certification system. Users prove their age (18+) by obtaining a digitally signed certificate stored in their BSV wallet. Third-party apps (e.g., a whiskey store) can verify this certificate without the user re-entering their information.

## Architecture

```
Single Next.js app (port 3000)
├── Browser: WalletClient ←→ MetaNet Desktop extension
├── API routes: /api/certify, /api/email, /api/verify, /api/revoke
└── Server-side: ProtoWallet signs certificates with a private key
```

No database. No Express server. Email codes live in memory. Certificates live in the user's wallet.

---

## Core Concepts

### What is a BSV Certificate?

A certificate is a signed data structure with these fields:

```
type            → category identifier (e.g., "Bdid" or "Bvc")
serialNumber    → unique ID generated during issuance
subject         → user's public key (who the cert is about)
certifier       → server's public key (who signed it)
revocationOutpoint → blockchain reference for revocation
fields          → key-value pairs (the actual data)
signature       → certifier's cryptographic signature over all above
```

The **signature** is what makes it trustworthy. Anyone with the certifier's public key can verify the certificate is authentic and unmodified.

### DID Certificate (Bdid)

**DID = Decentralized Identifier.** A persistent identity anchor.

```typescript
// Bdid certificate fields
{
  didId: "did:bsv:03b1b8a7...",  // derived from user's public key
  didType: "identity",
  version: "1.0",
  created: "2026-02-17T...",
  updated: "2026-02-17T...",
  isDID: "true",
  isVC: "false"
}
```

The DID is deterministic — same user always gets the same DID (`did:bsv:{first 32 chars of identity key}`). It's created automatically when a new user connects. Think of it as "registering" the user's identity on the certifier.

### VC Certificate (Bvc)

**VC = Verifiable Credential.** The actual identity data.

```typescript
// Bvc certificate fields
{
  firstName: "John",
  lastName: "Doe",
  birthdate: "15/03/1990",
  over18: "true",           // ← the key claim
  gender: "Male",
  email: "john@example.com",
  occupation: "Developer",
  country: "US",
  provinceState: "CA",
  city: "San Francisco",
  streetAddress: "123 Main St",
  postalCode: "94102",
  isVC: "true",
  isDID: "false"
}
```

All field values are **strings** (BSV SDK requirement). The `over18` field is computed server-side from the birthdate before signing.

### Certificate vs DID vs VC — Summary

| | DID (Bdid) | VC (Bvc) |
|--|-----------|----------|
| **Purpose** | Identity anchor | Identity data |
| **Created** | Automatically on first visit | User fills form + submits |
| **Contains** | DID identifier, timestamps | Name, birthdate, address, over18 |
| **Required first?** | Yes — must exist before Bvc | No — depends on Bdid |
| **What third parties check** | Not usually | Yes — they verify `over18: "true"` |

Both are BSV certificates with the same structure. The `type` field distinguishes them:
- `Utils.toBase64(Utils.toArray('Bdid', 'base64'))` → DID type
- `Utils.toBase64(Utils.toArray('Bvc', 'base64'))` → VC type

---

## How Certificate Issuance Works

### Step 1: Server signs with `MasterCertificate.issueCertificateForSubject()`

```typescript
import { ProtoWallet, PrivateKey, MasterCertificate } from '@bsv/sdk'

const protoWallet = new ProtoWallet(PrivateKey.fromHex(SERVER_PRIVATE_KEY))

const masterCert = await MasterCertificate.issueCertificateForSubject(
  protoWallet,          // signer (server's wallet)
  userIdentityKey,      // subject (user's public key)
  fields,               // plaintext key-value pairs
  certType,             // "Bdid" or "Bvc" encoded
  async () => '00'.repeat(32) + '.0'  // revocation outpoint
)
```

What `issueCertificateForSubject()` does internally:
1. Generates a unique `serialNumber`
2. **Encrypts each field** with a key derived from (certifier + subject) — only the subject can decrypt
3. Creates a `masterKeyring` — encryption metadata so the subject's wallet can decrypt the fields
4. Signs the certificate with the certifier's private key
5. Returns the complete certificate + keyring

### Step 2: Server returns certificate data to the browser

```json
{
  "type": "QmRpZA==",
  "serialNumber": "rLNVnnN1Wq1NB5/B...",
  "subject": "03b1b8a7dd...",
  "certifier": "024c144093...",
  "revocationOutpoint": "0000...0000.0",
  "fields": { "firstName": "encrypted...", "lastName": "encrypted..." },
  "signature": "3045...",
  "keyringForSubject": { "firstName": "keydata...", "lastName": "keydata..." }
}
```

Note: `fields` are **encrypted** at this point. The `keyringForSubject` contains the decryption keys.

### Step 3: Browser stores with `wallet.acquireCertificate()`

```typescript
await wallet.acquireCertificate({
  type: certData.type,
  certifier: certData.certifier,
  acquisitionProtocol: 'direct',    // ← "direct" = we already have the cert data
  fields: certData.fields,          // encrypted fields
  serialNumber: certData.serialNumber,
  revocationOutpoint: certData.revocationOutpoint,
  signature: certData.signature,
  keyringRevealer: 'certifier',
  keyringForSubject: certData.keyringForSubject,  // decryption keys
})
```

The `acquisitionProtocol: 'direct'` tells the wallet "I already fetched this certificate from the server, just store it." The wallet:
1. Verifies the signature
2. Stores the encrypted fields + keyring in its internal database
3. Can decrypt fields on demand using the keyring

---

## How Storage Works in the BSV Wallet

### Where certificates live

The BSV wallet (MetaNet Desktop) stores certificates in its internal encrypted database. This is **not** localStorage or a blockchain transaction — it's the wallet's own storage layer, synced via `storage.babbage.systems`.

### How to list stored certificates

```typescript
const result = await wallet.listCertificates({
  certifiers: ['024c144093...'],  // filter by who signed them
  types: ['QmRpZA==', 'QnZj'],   // filter by certificate type
})

// Returns: { certificates: [{ type, serialNumber, subject, certifier, fields, ... }] }
```

The `fields` returned by `listCertificates()` are the **encrypted** versions. The wallet decrypts them transparently when the user's app requests them.

### What a stored certificate looks like in the wallet

```
Certificate #1 (Bdid)
├── type: "QmRpZA=="
├── serialNumber: "rLNVnnN1Wq1NB5/B..."
├── subject: "03b1b8a7dd..." (user's identity key)
├── certifier: "024c144093..." (server's identity key)
├── revocationOutpoint: "0000...0000.0"
├── fields: { didId: "encrypted", version: "encrypted", ... }
└── signature: "3045..."

Certificate #2 (Bvc)
├── type: "QnZj"
├── serialNumber: "jdkd6bWg2nH2qzT9..."
├── subject: "03b1b8a7dd..."
├── certifier: "024c144093..."
├── fields: { firstName: "encrypted", over18: "encrypted", ... }
└── signature: "3045..."
```

### Certificate lifecycle

```
Created  → acquireCertificate()    → stored in wallet
Listed   → listCertificates()      → filtered by certifier + type
Verified → Certificate.verify()    → checks signature against certifier pubkey
Revoked  → relinquishCertificate() → removed from wallet
```

---

## How the System Recognizes Returning Users

On every page load, the wallet provider runs:

```typescript
const result = await wallet.listCertificates({
  certifiers: [SERVER_PUBLIC_KEY],
  types: [CERT_TYPE_BDID, CERT_TYPE_BVC],
})
```

Decision tree:
```
Has Bvc cert? → YES → Go to dashboard (authenticated)
Has Bdid cert? → YES → Go to form (DID exists, need identity data)
Has nothing? → Go to email verification (new user)
```

**That's the entire auth system.** No sessions, no tokens, no database lookups. "Has a valid Bvc certificate signed by our server" = authenticated.

---

## Complete User Flow

```
1. USER opens app
   └─ WalletProvider auto-connects to MetaNet Desktop
   └─ Calls listCertificates() to check existing certs

2. NEW USER (no certs found) → Email step
   └─ Enters email address
   └─ Server generates 6-digit code, sends via Brevo
   └─ Code stored in-memory Map (10-min TTL)
   └─ User enters code → verified

3. EMAIL VERIFIED → Form step
   └─ Auto-creates DID certificate (Bdid):
      ├─ POST /api/certify { identityKey, fields: { didId, isDID: "true" }, type: BDID }
      ├─ Server signs with MasterCertificate.issueCertificateForSubject()
      └─ Browser stores with wallet.acquireCertificate({ acquisitionProtocol: 'direct' })
   └─ User fills identity form (name, birthdate, address...)
   └─ Clicks "Generate Certificate":
      ├─ Client validates over18 from birthdate
      ├─ POST /api/certify { identityKey, fields: { firstName, over18: "true", ... }, type: BVC }
      ├─ Server signs certificate
      └─ Browser stores Bvc certificate in wallet

4. CERTIFICATE GENERATED → Dashboard
   └─ checkCertificates() detects Bvc → routes to dashboard
   └─ User can: refresh, revoke, logout, or return to referring app

5. RETURNING USER (has Bvc cert) → Dashboard immediately
   └─ listCertificates() finds Bvc → skip everything, go to dashboard
```

---

## Third-Party Verification

Any app can verify a certificate by calling the `/api/verify` endpoint:

```typescript
// Third-party app sends the certificate to verify
const res = await fetch('https://certifier.example.com/api/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ certificate: userCertificate }),
})

const { valid, certifier, subject } = await res.json()
// valid: true = signature checks out, issued by this certifier
```

Or verify locally without network (just needs the certifier's public key):

```typescript
import { Certificate } from '@bsv/sdk'

const cert = new Certificate(type, serialNumber, subject, certifier, revocationOutpoint, fields)
cert.signature = signature
const isValid = await cert.verify()  // checks signature against certifier pubkey
```

---

## Integration as an Auth Module

### For a third-party app (e.g., whiskey store)

**Option A: Redirect flow**

```
1. Whiskey store redirects to: https://certifier.example.com?returnUrl=https://store.com/callback
2. User gets certified (or is already certified)
3. Over18Certifier redirects back to returnUrl
4. Whiskey store calls wallet.listCertificates() to check for Bvc cert
```

**Option B: Direct wallet check**

```typescript
// In the whiskey store's code — no redirect needed
const CERTIFIER_PUBKEY = '024c144093f5a2a5f71ce61dce874d3f1ada840446cebdd283b6a8ccfe9e83d9e4'
const BVC_TYPE = Utils.toBase64(Utils.toArray('Bvc', 'base64'))

const result = await wallet.listCertificates({
  certifiers: [CERTIFIER_PUBKEY],
  types: [BVC_TYPE],
})

const certs = result.certificates || []
if (certs.length > 0) {
  // User has a valid over-18 certificate
  // Optionally verify signature: await cert.verify()
  allowAccess()
} else {
  // Redirect to Over18Certifier to get certified
  window.location.href = `https://certifier.example.com?returnUrl=${encodeURIComponent(window.location.href)}`
}
```

**Option C: Server-side verification**

```typescript
// Whiskey store backend receives certificate from frontend
const res = await fetch('https://certifier.example.com/api/verify', {
  method: 'POST',
  body: JSON.stringify({ certificate }),
})
const { valid } = await res.json()
```

### Key point for integration

The only things another system needs:
1. **Certifier's public key** — to filter/verify certificates
2. **Certificate type constant** — `Utils.toBase64(Utils.toArray('Bvc', 'base64'))`
3. **`@bsv/sdk`** — to call `listCertificates()` and `Certificate.verify()`

No API keys, no OAuth, no shared secrets. The cryptography handles trust.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVER_PRIVATE_KEY` | Yes | Hex-encoded private key for signing certificates |
| `NEXT_PUBLIC_SERVER_PUBLIC_KEY` | Yes | Corresponding public key (used client-side) |
| `BREVO_API_KEY` | Yes | Brevo transactional email API key |
| `SENDER_EMAIL` | Yes | Verified sender email address in Brevo |
| `CHAIN` | No | BSV network: `main` (default) or `test` |

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # WalletProvider + Toaster wrapper
│   ├── page.tsx                # Thin shell: routes between steps (~38 LOC)
│   ├── globals.css             # Tailwind + shadcn theme
│   └── api/
│       ├── certify/route.ts    # POST: Issue Bdid or Bvc certificate
│       ├── email/route.ts      # POST: Send/verify email codes (in-memory)
│       ├── revoke/route.ts     # POST: Acknowledge revocation
│       └── verify/route.ts     # POST: Third-party certificate verification
├── components/
│   ├── wallet-provider.tsx     # WalletClient context + cert detection + routing
│   ├── email-verification.tsx  # Email input + code entry
│   ├── identity-form.tsx       # Personal info form + DID/cert generation
│   ├── certificate-dashboard.tsx # Post-login: cert details, revoke, logout
│   └── ui/                     # shadcn components (button, card, input, label, select, separator)
└── lib/
    ├── types.ts                # Shared types + certificate type constants
    ├── certifier.ts            # ProtoWallet singleton + issueCertificate()
    ├── geographic-data.ts      # Countries, provinces, age calculation
    └── cn.ts                   # Tailwind merge utility
```

## Commands

```bash
npm run dev    # Start dev server on port 3000
npm run build  # Production build
npm run start  # Start production server
```
