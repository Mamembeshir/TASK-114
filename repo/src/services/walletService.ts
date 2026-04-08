/**
 * WalletService — all wallet mutations go through here.
 *
 * Design decisions (per CLAUDE.md #2):
 *  - Deduct deposit ONLY on auction win.
 *  - During active bidding, hold a "reserved" amount (no deduction yet).
 *
 * Security: `balance` and `reservedAmount` are stored as AES-GCM-256
 * ciphertext in `encBalance` / `encReservedAmount`.  All encrypt/decrypt
 * operations are performed OUTSIDE Dexie transactions to avoid the
 * `PrematureCommitError` that occurs when Web Crypto Promises escape
 * Dexie's internal microtask-zone tracking.  For this single-user offline
 * application the resulting read-modify-write pattern is safe.
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import { encrypt, decrypt } from '@/crypto/encryption'
import { getAppKey } from '@/crypto/appKey'
import { useAuthStore } from '@/store/authStore'
import { requirePermission } from '@/utils/permissions'
import { hasPermission } from '@/auth/permissions'
import type { Wallet, WalletDecrypted, WalletTransactionType } from '@/types'

// ── Encryption helpers ────────────────────────────────────────────────────────

async function encNum(value: number): Promise<string> {
  const key = await getAppKey()
  return encrypt(String(value), key)
}

async function decNum(cipher: string): Promise<number> {
  const key = await getAppKey()
  return Number(await decrypt(cipher, key))
}

async function decryptWallet(w: Wallet): Promise<WalletDecrypted> {
  const [balance, reservedAmount] = await Promise.all([
    decNum(w.encBalance),
    decNum(w.encReservedAmount),
  ])
  return { id: w.id, userId: w.userId, balance, reservedAmount, updatedAt: w.updatedAt }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function recordTransaction(
  walletId: string,
  userId: string,
  type: WalletTransactionType,
  amount: number,
  description: string,
  createdBy: string,
  relatedAuctionId?: string,
): Promise<void> {
  await db.walletTransactions.add({
    id: generateId(),
    walletId,
    userId,
    type,
    amount,
    description,
    createdBy,
    relatedAuctionId,
    createdAt: Date.now(),
  })
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Ensure a wallet record exists for the user; create one (zero balance) if not. */
export async function ensureWallet(userId: string): Promise<void> {
  const existing = await db.wallets.where('userId').equals(userId).first()
  if (!existing) {
    // Encrypt outside — no Dexie transaction needed for a simple insert
    const [encBalance, encReservedAmount] = await Promise.all([encNum(0), encNum(0)])
    await db.wallets.add({
      id: generateId(),
      userId,
      encBalance,
      encReservedAmount,
      updatedAt: Date.now(),
    })
  }
}

/** Return the decrypted wallet for a user, or null if none exists.
 *  Callers must be the wallet owner or have `manageWallets` permission. */
export async function getWallet(userId: string): Promise<WalletDecrypted | null> {
  const currentUser = useAuthStore.getState().currentUser
  if (!currentUser) throw new Error('Forbidden: not authenticated')
  if (currentUser.id !== userId && !hasPermission(currentUser.role, 'manageWallets'))
    throw new Error('Forbidden: you can only view your own wallet')
  const w = await db.wallets.where('userId').equals(userId).first()
  return w ? decryptWallet(w) : null
}

/** Credit (add funds) to a user's wallet. Restricted to users with manageWallets permission. */
export async function creditWallet(
  userId: string,
  amount: number,
  description: string,
  relatedAuctionId?: string,
): Promise<void> {
  requirePermission('manageWallets')
  const actorId = useAuthStore.getState().currentUser!.id
  if (amount <= 0) throw new Error('Credit amount must be positive')
  await ensureWallet(userId)

  // Read + decrypt outside the transaction
  const wallet = await db.wallets.where('userId').equals(userId).first()
  if (!wallet) throw new Error('Wallet not found')
  const plain = await decryptWallet(wallet)

  // Encrypt new value outside the transaction
  const encBalance = await encNum(plain.balance + amount)

  await db.wallets.update(wallet.id, { encBalance, updatedAt: Date.now() })
  await recordTransaction(
    wallet.id,
    userId,
    'Credit',
    amount,
    description,
    actorId,
    relatedAuctionId,
  )
}

/** Debit (remove funds) from a user's wallet. Restricted to users with manageWallets permission. */
export async function debitWallet(
  userId: string,
  amount: number,
  description: string,
  relatedAuctionId?: string,
): Promise<void> {
  requirePermission('manageWallets')
  const actorId = useAuthStore.getState().currentUser!.id
  if (amount <= 0) throw new Error('Debit amount must be positive')

  const wallet = await db.wallets.where('userId').equals(userId).first()
  if (!wallet) throw new Error('Wallet not found')
  const plain = await decryptWallet(wallet)

  const available = plain.balance - plain.reservedAmount
  if (available < amount) throw new Error('Insufficient wallet balance')

  const encBalance = await encNum(plain.balance - amount)

  await db.wallets.update(wallet.id, { encBalance, updatedAt: Date.now() })
  await recordTransaction(
    wallet.id,
    userId,
    'Debit',
    amount,
    description,
    actorId,
    relatedAuctionId,
  )
}

/**
 * Pre-computed result from `prepareReservation`.
 * Pass this to `applyReservation` (or `applyReservationInTx`) to do the actual DB writes.
 */
export interface PreparedReservation {
  walletId: string
  encReservedAmount: string
  delta: number
  auctionId: string
  userId: string
}

/**
 * Compute the current reservation held by a user for a specific auction by
 * summing persisted wallet transactions (Reserve minus Release) keyed by
 * auction + user.  This is the authoritative source — never trust UI state.
 */
export async function getCurrentReservation(
  userId: string,
  auctionId: string,
): Promise<number> {
  const txns = await db.walletTransactions
    .where('relatedAuctionId')
    .equals(auctionId)
    .filter((t) => t.userId === userId && (t.type === 'Reserve' || t.type === 'Release'))
    .toArray()
  let held = 0
  for (const t of txns) {
    if (t.type === 'Reserve') held += t.amount
    else if (t.type === 'Release') held -= t.amount
  }
  return Math.max(held, 0)
}

/**
 * Compute the encrypted wallet reservation update for a bid deposit hold — NO DB writes.
 *
 * Call this BEFORE entering a Dexie transaction so Web Crypto Promises run
 * outside the transaction zone (avoids `PrematureCommitError`).
 *
 * `previousReserveAmount` is now computed service-side from persisted wallet
 * transactions when not provided, making the operation idempotent regardless
 * of what the UI reports.
 */
export async function prepareReservation(
  userId: string,
  auctionId: string,
  newReserveAmount: number,
  _previousReserveAmount?: number,
): Promise<PreparedReservation> {
  const wallet = await db.wallets.where('userId').equals(userId).first()
  if (!wallet) throw new Error('Wallet not found')
  const plain = await decryptWallet(wallet)

  // Authoritative prior hold from persisted transactions — ignore UI-supplied value
  const previousReserveAmount = await getCurrentReservation(userId, auctionId)

  const delta = newReserveAmount - previousReserveAmount
  const available = plain.balance - plain.reservedAmount
  if (delta > 0 && available < delta)
    throw new Error('Insufficient wallet balance for deposit hold')

  return {
    walletId: wallet.id,
    encReservedAmount: await encNum(plain.reservedAmount + delta),
    delta,
    auctionId,
    userId,
  }
}

/**
 * Apply a pre-computed reservation — only pure IndexedDB writes, no crypto.
 * Safe to call inside a Dexie transaction.
 */
export async function applyReservationInTx(prepared: PreparedReservation): Promise<void> {
  await db.wallets.update(prepared.walletId, {
    encReservedAmount: prepared.encReservedAmount,
    updatedAt: Date.now(),
  })
  if (prepared.delta !== 0) {
    const type: WalletTransactionType = prepared.delta > 0 ? 'Reserve' : 'Release'
    await db.walletTransactions.add({
      id: generateId(),
      walletId: prepared.walletId,
      userId: prepared.userId,
      type,
      amount: Math.abs(prepared.delta),
      description: `Deposit hold adjusted for auction ${prepared.auctionId}`,
      createdBy: prepared.userId,
      relatedAuctionId: prepared.auctionId,
      createdAt: Date.now(),
    })
  }
}

/**
 * Reserve an amount in the wallet (hold without deducting from balance).
 * Replaces any existing reservation for the same auction so re-bidding works correctly.
 * Use `prepareReservation` + `applyReservationInTx` when calling inside a Dexie transaction.
 */
export async function reserveForAuction(
  userId: string,
  auctionId: string,
  newReserveAmount: number,
  previousReserveAmount: number,
): Promise<void> {
  const prepared = await prepareReservation(
    userId,
    auctionId,
    newReserveAmount,
    previousReserveAmount,
  )
  await applyReservationInTx(prepared)
}

/** Release the reserved hold when an auction ends without the user winning. */
export async function releaseReservation(
  userId: string,
  auctionId: string,
  reservedAmount: number,
): Promise<void> {
  if (reservedAmount <= 0) return

  const wallet = await db.wallets.where('userId').equals(userId).first()
  if (!wallet) return
  const plain = await decryptWallet(wallet)

  const encReservedAmount = await encNum(Math.max(0, plain.reservedAmount - reservedAmount))

  await db.wallets.update(wallet.id, { encReservedAmount, updatedAt: Date.now() })
  await recordTransaction(
    wallet.id,
    userId,
    'Release',
    reservedAmount,
    `Reservation released — auction ${auctionId}`,
    userId,
    auctionId,
  )
}

/**
 * Deduct the auction deposit from the winner's wallet on award.
 * Converts the existing reservation into an actual deduction.
 */
export async function deductDeposit(
  userId: string,
  auctionId: string,
  depositAmount: number,
): Promise<void> {
  const wallet = await db.wallets.where('userId').equals(userId).first()
  if (!wallet) throw new Error('Wallet not found')
  const plain = await decryptWallet(wallet)

  const [encBalance, encReservedAmount] = await Promise.all([
    encNum(plain.balance - depositAmount),
    encNum(Math.max(0, plain.reservedAmount - depositAmount)),
  ])

  await db.wallets.update(wallet.id, { encBalance, encReservedAmount, updatedAt: Date.now() })
  await recordTransaction(
    wallet.id,
    userId,
    'DepositDeducted',
    depositAmount,
    `Auction deposit deducted — won auction ${auctionId}`,
    userId,
    auctionId,
  )
}
