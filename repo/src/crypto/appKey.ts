/**
 * appKey — shared AES-GCM master key accessor.
 *
 * The key is generated once per browser profile and persisted in LocalStorage
 * as a base-64 exported raw key.  It is reused for:
 *   - Session-token encryption (authStore)
 *   - Wallet balance encryption at rest (walletService)
 *   - Document title/body encryption at rest (documentService)
 *
 * Keeping a single key (vs. one per domain) is intentional for this
 * offline-only application: there is no server key-management service, so
 * the threat model is limited to physical access to the raw IndexedDB files.
 * Separate keys would add ceremony without meaningfully reducing that risk.
 */

import { generateEncryptionKey, exportKey, importKey, encrypt, decrypt } from './encryption'

const LS_ENC_KEY = 'meridian_enc_key'

let _cached: CryptoKey | null = null
// Pending promise prevents concurrent callers from each generating a separate key.
let _pending: Promise<CryptoKey> | null = null

/**
 * Return the device-scoped AES-GCM-256 master key.
 * Creates and persists a new key on first call; subsequent calls return the
 * in-memory cached instance (or re-import from LocalStorage after a reload).
 * Concurrent callers share a single in-flight promise to avoid generating
 * multiple keys when Promise.all triggers several simultaneous calls.
 */
export async function getAppKey(): Promise<CryptoKey> {
  if (_cached) return _cached
  if (_pending) return _pending
  _pending = (async () => {
    const stored = localStorage.getItem(LS_ENC_KEY)
    if (stored) {
      _cached = await importKey(stored)
    } else {
      const key = await generateEncryptionKey()
      localStorage.setItem(LS_ENC_KEY, await exportKey(key))
      _cached = key
    }
    _pending = null
    return _cached as CryptoKey
  })()
  return _pending
}

// ── Passphrase-protected key export/import for backup portability ────────────

/**
 * Derive a wrapping key from a passphrase using PBKDF2.
 * Returns both the CryptoKey and the random salt used.
 */
async function deriveWrappingKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Export the app encryption key wrapped (encrypted) with a user-supplied passphrase.
 * Returns a JSON string containing salt + ciphertext, safe to embed in a backup file.
 */
export async function wrapAppKey(passphrase: string): Promise<string> {
  const appKey = await getAppKey()
  const rawB64 = await exportKey(appKey)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const wrappingKey = await deriveWrappingKey(passphrase, salt)
  const ciphertext = await encrypt(rawB64, wrappingKey)

  // Encode salt as hex for safe JSON transport
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('')
  return JSON.stringify({ saltHex, ciphertext })
}

/**
 * Unwrap a previously exported app key using the same passphrase.
 * On success, installs the key as the active app key (LocalStorage + cache).
 */
export async function unwrapAppKey(wrapped: string, passphrase: string): Promise<void> {
  const { saltHex, ciphertext } = JSON.parse(wrapped) as { saltHex: string; ciphertext: string }
  const salt = new Uint8Array(
    (saltHex.match(/.{2}/g) ?? []).map((h: string) => parseInt(h, 16)),
  )
  const wrappingKey = await deriveWrappingKey(passphrase, salt)
  const rawB64 = await decrypt(ciphertext, wrappingKey)

  // Validate the unwrapped key material can be imported
  const restored = await importKey(rawB64)
  // Persist and cache
  localStorage.setItem(LS_ENC_KEY, await exportKey(restored))
  _cached = restored
}
