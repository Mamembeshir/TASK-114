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

// ── LocalStorage keys ─────────────────────────────────────────────────────────
const LS_ENC_KEY = 'meridian_enc_key'
const LS_SESSION = 'meridian_session'

// ── Session config ────────────────────────────────────────────────────────────
/** Session lifetime: 8 hours */
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000

interface SessionToken {
  sessionId: string
  userId: string
  expiresAt: number
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
      // 1. Look up user — case-insensitive
      const user = await db.users.where('username').equals(username.toLowerCase().trim()).first()

      // Return the same error for "not found" and "wrong password"
      // to avoid leaking which field failed
      if (!user?.isActive) {
        set({ isLoading: false, error: 'Invalid username or password' })
        return
      }

      // 2. Verify PBKDF2 hash
      const valid = await verifyPassword(password, user.passwordHash, user.passwordSalt)
      if (!valid) {
        set({ isLoading: false, error: 'Invalid username or password' })
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

      // 5. Append-only audit log
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

// ── Default admin seeding ─────────────────────────────────────────────────────

/**
 * On first launch (empty users table), seed the default Administrator account.
 * `isTemporaryPassword: true` signals the UI to prompt a password change.
 *
 * Default credentials — change immediately after first login:
 *   username : admin
 *   password : Admin@1234!
 */
export async function seedDefaultAdmin(): Promise<void> {
  const count = await db.users.count()
  if (count > 0) return

  const { hash, salt } = await hashPassword('Admin@1234!')
  const now = Date.now()

  await db.users.add({
    id: generateId(),
    username: 'admin',
    displayName: 'Administrator',
    email: '',
    passwordHash: hash,
    passwordSalt: salt,
    role: Role.Administrator,
    isActive: true,
    isTemporaryPassword: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'system',
  })
}
