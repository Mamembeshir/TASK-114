import { create } from 'zustand'
import { db } from '@/db'
import {
  hashPassword,
  verifyPassword,
  generateEncryptionKey,
  exportKey,
  importKey,
  encrypt,
  decrypt,
  generateId,
} from '@/crypto'
import { Role } from '@/types'
import type { User } from '@/types'
import { writeAuditLog } from '@/utils/audit'
import { useTabStore } from '@/store/tabStore'
import { useNotificationStore } from '@/store/notificationStore'

// ── LocalStorage keys ─────────────────────────────────────────────────────────
const LS_ENC_KEY = 'meridian_enc_key'
const LS_SESSION = 'meridian_session'
const LS_LOCKOUT_PREFIX = 'meridian_lockout_'

// ── Session config ────────────────────────────────────────────────────────────
/** Session lifetime: 8 hours */
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000

/** Max failed login attempts before lockout */
const MAX_FAILURES = 5
/** Lockout duration after exceeding max failures */
const LOCKOUT_DURATION_MS = 15 * 60 * 1000

interface SessionToken {
  sessionId: string
  userId: string
  expiresAt: number
}

interface LoginAttemptRecord {
  failures: number
  lockedUntil?: number
}

// ── Login-attempt helpers ─────────────────────────────────────────────────────

function lockoutKey(username: string): string {
  return `${LS_LOCKOUT_PREFIX}${username.toLowerCase()}`
}

function getAttemptRecord(username: string): LoginAttemptRecord {
  try {
    const raw = localStorage.getItem(lockoutKey(username))
    if (raw) return JSON.parse(raw) as LoginAttemptRecord
  } catch {
    // ignore parse errors
  }
  return { failures: 0 }
}

function recordFailure(username: string): void {
  const rec = getAttemptRecord(username)
  const failures = rec.failures + 1
  const lockedUntil = failures >= MAX_FAILURES ? Date.now() + LOCKOUT_DURATION_MS : rec.lockedUntil
  localStorage.setItem(lockoutKey(username), JSON.stringify({ failures, lockedUntil }))
}

function clearAttempts(username: string): void {
  localStorage.removeItem(lockoutKey(username))
}

// ── Store shape ───────────────────────────────────────────────────────────────
// Use property-arrow-function syntax (not method shorthand) so that
// @typescript-eslint/unbound-method does not fire when selectors extract them.
interface AuthState {
  currentUser: User | null
  sessionId: string | null
  /** True while verifying credentials or restoring a persisted session */
  isLoading: boolean
  error: string | null
}

interface AuthActions {
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  restoreSession: () => Promise<void>
  clearError: () => void
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Return the master AES-GCM key, creating and persisting it on first call. */
async function getOrCreateMasterKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(LS_ENC_KEY)
  if (stored) return importKey(stored)
  const key = await generateEncryptionKey()
  localStorage.setItem(LS_ENC_KEY, await exportKey(key))
  return key
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  currentUser: null,
  sessionId: null,
  isLoading: false,
  error: null,

  clearError: () => {
    set({ error: null })
  },

  // ── login ──────────────────────────────────────────────────────────────────
  login: async (username, password) => {
    set({ isLoading: true, error: null })
    try {
      const normalizedUsername = username.toLowerCase().trim()

      // 0. Check lockout before touching the DB
      const attemptRec = getAttemptRecord(normalizedUsername)
      if (attemptRec.lockedUntil && Date.now() < attemptRec.lockedUntil) {
        const remaining = Math.ceil((attemptRec.lockedUntil - Date.now()) / 60_000)
        const unit = remaining === 1 ? 'minute' : 'minutes'
        set({
          isLoading: false,
          error: `Account locked — too many failed attempts. Try again in ${String(remaining)} ${unit}.`,
        })
        return
      }

      // 1. Look up user — case-insensitive
      const user = await db.users.where('username').equals(normalizedUsername).first()

      // Return the same error for "not found" and "wrong password"
      // to avoid leaking which field failed
      if (!user?.isActive) {
        recordFailure(normalizedUsername)
        set({ isLoading: false, error: 'Invalid username or password' })
        return
      }

      // 2. Verify PBKDF2 hash
      const valid = await verifyPassword(password, user.passwordHash, user.passwordSalt)
      if (!valid) {
        recordFailure(normalizedUsername)
        const rec = getAttemptRecord(normalizedUsername)
        const remaining = MAX_FAILURES - rec.failures
        const msg =
          remaining > 0
            ? `Invalid username or password (${String(remaining)} attempt${remaining === 1 ? '' : 's'} left)`
            : 'Account locked — too many failed attempts. Try again in 15 minutes.'
        set({ isLoading: false, error: msg })
        return
      }

      // 3. Create session record in IndexedDB
      const sessionId = generateId()
      const now = Date.now()
      const expiresAt = now + SESSION_DURATION_MS

      await db.sessions.add({
        id: sessionId,
        userId: user.id,
        token: sessionId,
        createdAt: now,
        expiresAt,
      })

      // 4. Encrypt session token → LocalStorage
      const masterKey = await getOrCreateMasterKey()
      const payload: SessionToken = { sessionId, userId: user.id, expiresAt }
      const encryptedToken = await encrypt(JSON.stringify(payload), masterKey)
      localStorage.setItem(LS_SESSION, encryptedToken)

      // 5. Clear failed-attempt counter on successful login
      clearAttempts(normalizedUsername)

      // 6. Append-only audit log
      await writeAuditLog({
        eventType: 'user.login',
        actorId: user.id,
        actorName: user.displayName,
        entityType: 'User',
        entityId: user.id,
        description: `${user.displayName} signed in`,
      })

      set({ currentUser: user, sessionId, isLoading: false, error: null })
    } catch {
      set({ isLoading: false, error: 'Login failed. Please try again.' })
    }
  },

  // ── logout ─────────────────────────────────────────────────────────────────
  logout: async () => {
    const { currentUser, sessionId } = get()
    try {
      if (currentUser && sessionId) {
        await writeAuditLog({
          eventType: 'user.logout',
          actorId: currentUser.id,
          actorName: currentUser.displayName,
          entityType: 'User',
          entityId: currentUser.id,
          description: `${currentUser.displayName} signed out`,
        })
        await db.sessions.delete(sessionId)
      }
    } catch {
      // Best-effort — clear local state regardless of DB write result
    }
    localStorage.removeItem(LS_SESSION)
    set({ currentUser: null, sessionId: null, isLoading: false, error: null })
    // Clear per-user in-memory state so the next user starts clean
    useTabStore.getState().reset()
    useNotificationStore.getState().reset()
  },

  // ── restoreSession ─────────────────────────────────────────────────────────
  restoreSession: async () => {
    set({ isLoading: true })
    try {
      const storedKey = localStorage.getItem(LS_ENC_KEY)
      const storedSession = localStorage.getItem(LS_SESSION)

      if (!storedKey || !storedSession) {
        set({ isLoading: false })
        return
      }

      const masterKey = await importKey(storedKey)
      const tokenJson = await decrypt(storedSession, masterKey)
      const token = JSON.parse(tokenJson) as SessionToken

      // Reject expired sessions
      if (Date.now() > token.expiresAt) {
        localStorage.removeItem(LS_SESSION)
        set({ isLoading: false })
        return
      }

      // Verify session row still exists in IndexedDB
      const session = await db.sessions.get(token.sessionId)
      if (!session) {
        localStorage.removeItem(LS_SESSION)
        set({ isLoading: false })
        return
      }

      // Load user and verify still active
      const user = await db.users.get(token.userId)
      if (!user?.isActive) {
        localStorage.removeItem(LS_SESSION)
        set({ isLoading: false })
        return
      }

      set({ currentUser: user, sessionId: token.sessionId, isLoading: false })
    } catch {
      // Corrupted / tampered session — force re-login
      localStorage.removeItem(LS_SESSION)
      set({ isLoading: false })
    }
  },
}))

// ── Demo account seeding ──────────────────────────────────────────────────────

/**
 * On first launch (empty users table), seed three staff accounts so the
 * portal is immediately usable. Buyer (Participant) accounts are created via
 * the self-registration form on the login screen.
 *
 * All accounts use the same pattern:  password = <username>Pass1!
 *
 * | Username  | Role               | Password        |
 * | --------- | ------------------ | --------------- |
 * | admin     | Administrator      | adminPass1!     |
 * | editor    | ContentEditor      | editorPass1!    |
 * | reviewer  | ReviewerApprover   | reviewerPass1!  |
 */
export async function seedDefaultAdmin(): Promise<void> {
  const now = Date.now()

  interface AccountSeed {
    username: string
    displayName: string
    email: string
    password: string
    role: Role
  }
  const accounts: AccountSeed[] = [
    {
      username: 'admin',
      displayName: 'Admin User',
      email: 'admin@meridian.internal',
      password: 'adminPass1!',
      role: Role.Administrator,
    },
    {
      username: 'editor',
      displayName: 'Content Editor',
      email: 'editor@meridian.internal',
      password: 'editorPass1!',
      role: Role.ContentEditor,
    },
    {
      username: 'reviewer',
      displayName: 'Reviewer',
      email: 'reviewer@meridian.internal',
      password: 'reviewerPass1!',
      role: Role.ReviewerApprover,
    },
  ]

  for (const account of accounts) {
    // Skip if this username already exists (idempotent — safe to call on every launch)
    const existing = await db.users.where('username').equals(account.username).first()
    if (existing) continue

    const { hash, salt } = await hashPassword(account.password)
    await db.users.add({
      id: generateId(),
      username: account.username,
      displayName: account.displayName,
      email: account.email,
      passwordHash: hash,
      passwordSalt: salt,
      role: account.role,
      isActive: true,
      isTemporaryPassword: true, // force password change on first login
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
    })
  }
}
