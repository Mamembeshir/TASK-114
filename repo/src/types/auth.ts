// ── Auth & Identity ───────────────────────────────────────────────────────────

export enum Role {
  Administrator = 'Administrator',
  ContentEditor = 'ContentEditor',
  ReviewerApprover = 'ReviewerApprover',
  Participant = 'Participant',
}

export interface User {
  id: string
  username: string
  displayName: string
  email: string
  /** PBKDF2-derived key stored as hex */
  passwordHash: string
  /** Random salt stored as hex */
  passwordSalt: string
  role: Role
  isActive: boolean
  /** True when Admin issues a temporary password — user must change on next login */
  isTemporaryPassword: boolean
  createdAt: number
  updatedAt: number
  /** userId of the administrator who created this account */
  createdBy: string
}

export interface Session {
  id: string
  userId: string
  /** Encrypted token persisted in LocalStorage */
  token: string
  createdAt: number
  expiresAt: number
}
