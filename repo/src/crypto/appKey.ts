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

import { generateEncryptionKey, exportKey, importKey } from './encryption'

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
