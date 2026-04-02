// ── System Configuration ──────────────────────────────────────────────────────

export interface SystemConfig {
  /** Always 'singleton' — only one row ever exists */
  id: 'singleton'
  orgName: string
  /** Base64-encoded logo image */
  orgLogo?: string
  /** Prefix for auto-generated document numbers e.g. 'ORG' → ORG-2026-000001 */
  documentNumberPrefix: string
  /** Auto-increment counter for document numbering — persisted here */
  documentNumberCounter: number
  defaultRetentionYears: number
  /** Seconds before auction end that triggers anti-sniping extension (default: 30) */
  antiSnipingWindowSeconds: number
  /** Minutes added to auction end time when anti-sniping triggers (default: 2) */
  antiSnipingExtensionMinutes: number
  defaultMinimumIncrement: number
  updatedAt: number
  updatedBy: string
}

export interface SensitiveWord {
  id: string
  /** Stored lowercase for case-insensitive matching */
  word: string
  createdBy: string
  createdAt: number
}
