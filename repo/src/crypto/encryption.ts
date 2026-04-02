/**
 * AES-GCM-256 symmetric encryption using the Web Crypto API.
 *
 * Usage pattern for session tokens in LocalStorage:
 *   1. Call `generateEncryptionKey()` once on first app load.
 *   2. Persist the key with `exportKey()` → store in LocalStorage as "masterKey".
 *   3. Restore on subsequent loads with `importKey()`.
 *   4. Use `encrypt()` / `decrypt()` for any sensitive value.
 *
 * Wire format: base64( IV[12 bytes] || Ciphertext )
 *   - Random 12-byte IV is prepended to ciphertext so each call is unique.
 *   - AES-GCM authentication tag (16 bytes) is appended automatically by the API.
 */

const IV_LENGTH = 12 // bytes — standard for AES-GCM

// ── Internal helpers ─────────────────────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ── Key management ────────────────────────────────────────────────────────────

/**
 * Generate a fresh AES-GCM-256 encryption key.
 * Call once per device/browser; persist via `exportKey`.
 */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

/**
 * Export a CryptoKey to a base64 string safe for LocalStorage.
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return bufferToBase64(raw)
}

/**
 * Re-import a CryptoKey previously exported with `exportKey`.
 */
export async function importKey(base64: string): Promise<CryptoKey> {
  const raw = base64ToUint8Array(base64).buffer
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────

/**
 * Encrypt a UTF-8 plaintext string.
 * Returns a base64-encoded string containing IV + ciphertext + GCM auth tag.
 */
export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)

  // Combine IV + ciphertext into a single buffer
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), IV_LENGTH)

  return bufferToBase64(combined.buffer)
}

/**
 * Decrypt a value previously encrypted with `encrypt`.
 * Throws a DOMException if the key is wrong or the ciphertext is tampered.
 */
export async function decrypt(base64Ciphertext: string, key: CryptoKey): Promise<string> {
  const combined = base64ToUint8Array(base64Ciphertext)
  const iv = combined.slice(0, IV_LENGTH)
  const ciphertext = combined.slice(IV_LENGTH)

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(decrypted)
}
