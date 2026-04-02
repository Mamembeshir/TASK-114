/**
 * Cryptographically secure ID generation using the Web Crypto API.
 *
 * `crypto.randomUUID()` is available in all modern browsers (Chrome 92+,
 * Firefox 95+, Safari 15.4+) and in Node.js 19+ / jsdom test environments.
 * It produces RFC 4122 v4 UUIDs with 122 bits of randomness.
 */

/**
 * Generate a cryptographically random UUID v4.
 * Use this for all entity `id` fields throughout the application.
 */
export function generateId(): string {
  return crypto.randomUUID()
}
