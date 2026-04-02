import { describe, it, expect } from 'vitest'
import { generateEncryptionKey, encrypt, decrypt, exportKey, importKey } from '@/crypto/encryption'

describe('generateEncryptionKey', () => {
  it('returns a CryptoKey with the correct algorithm', async () => {
    const key = await generateEncryptionKey()
    expect(key.type).toBe('secret')
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
    expect(key.usages).toContain('encrypt')
    expect(key.usages).toContain('decrypt')
  })
})

describe('encrypt / decrypt', () => {
  it('round-trips a UTF-8 plaintext string', async () => {
    const key = await generateEncryptionKey()
    const plaintext = 'hello, Meridian Portal 🔒'
    const ciphertext = await encrypt(plaintext, key)
    const decrypted = await decrypt(ciphertext, key)
    expect(decrypted).toBe(plaintext)
  })

  it('produces different ciphertext on each call due to random IV', async () => {
    const key = await generateEncryptionKey()
    const a = await encrypt('same message', key)
    const b = await encrypt('same message', key)
    expect(a).not.toBe(b)
  })

  it('throws when decrypting with a different key', async () => {
    const key1 = await generateEncryptionKey()
    const key2 = await generateEncryptionKey()
    const ciphertext = await encrypt('sensitive-session-token', key1)
    await expect(decrypt(ciphertext, key2)).rejects.toThrow()
  })

  it('throws when ciphertext is tampered', async () => {
    const key = await generateEncryptionKey()
    const ciphertext = await encrypt('original', key)
    // Corrupt the last character
    const tampered = ciphertext.slice(0, -1) + (ciphertext.endsWith('A') ? 'B' : 'A')
    await expect(decrypt(tampered, key)).rejects.toThrow()
  })
})

describe('exportKey / importKey', () => {
  it('exports a key to base64 and re-imports it for use', async () => {
    const originalKey = await generateEncryptionKey()
    const exported = await exportKey(originalKey)

    expect(typeof exported).toBe('string')
    expect(exported.length).toBeGreaterThan(0)

    const importedKey = await importKey(exported)
    // Encrypt with original, decrypt with imported
    const ciphertext = await encrypt('round-trip', originalKey)
    const decrypted = await decrypt(ciphertext, importedKey)
    expect(decrypted).toBe('round-trip')
  })
})
