/**
 * PBKDF2 password hashing using the Web Crypto API.
 *
 * Parameters chosen to meet OWASP 2024 / NIST SP 800-132 recommendations:
 *   - Algorithm : PBKDF2-HMAC-SHA-256
 *   - Iterations: 310,000  (OWASP minimum for SHA-256)
 *   - Salt      : 16 random bytes (128 bits)
 *   - Output    : 32 bytes (256 bits), stored as lowercase hex
 */

const ITERATIONS = 310_000
const SALT_LENGTH = 16 // bytes
const KEY_BITS = 256

// ── Internal helpers ─────────────────────────────────────────────────────────

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

async function importPasswordKey(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
}

async function deriveHash(key: CryptoKey, salt: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    key,
    KEY_BITS,
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface HashedPassword {
  /** 256-bit derived key encoded as 64-char lowercase hex */
  hash: string
  /** 128-bit random salt encoded as 32-char lowercase hex */
  salt: string
}

/**
 * Hash a plaintext password with a freshly generated random salt.
 * Store both `hash` and `salt` on the User record.
 */
export async function hashPassword(password: string): Promise<HashedPassword> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const keyMaterial = await importPasswordKey(password)
  const derivedBits = await deriveHash(keyMaterial, salt)
  return {
    hash: bufferToHex(derivedBits),
    salt: bufferToHex(salt.buffer),
  }
}

/**
 * Verify a plaintext password against a stored hash + salt.
 * Returns `true` only when the derived hash matches exactly.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> {
  const salt = hexToUint8Array(storedSalt)
  const keyMaterial = await importPasswordKey(password)
  const derivedBits = await deriveHash(keyMaterial, salt)
  return bufferToHex(derivedBits) === storedHash
}
