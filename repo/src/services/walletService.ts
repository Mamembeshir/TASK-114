/**
 * WalletService — all wallet mutations go through here.
 *
 * Design decisions (per CLAUDE.md #2):
 *  - Deduct deposit ONLY on auction win.
 *  - During active bidding, hold a "reserved" amount (no deduction yet).
 *  - All mutations are wrapped in Dexie transactions for atomicity.
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import type { WalletTransactionType } from '@/types'

// ── Internal helper ────────────────────────────────────────────────────────────

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
    await db.wallets.add({
      id: generateId(),
      userId,
      balance: 0,
      reservedAmount: 0,
      updatedAt: Date.now(),
    })
  }
}

/** Credit (add funds) to a user's wallet. Admin-initiated manual top-up. */
export async function creditWallet(
  userId: string,
  amount: number,
  description: string,
  actorId: string,
  relatedAuctionId?: string,
): Promise<void> {
  if (amount <= 0) throw new Error('Credit amount must be positive')
  await ensureWallet(userId)

  await db.transaction('rw', db.wallets, db.walletTransactions, async () => {
    const wallet = await db.wallets.where('userId').equals(userId).first()
    if (!wallet) throw new Error('Wallet not found')
    await db.wallets.update(wallet.id, {
      balance: wallet.balance + amount,
      updatedAt: Date.now(),
    })
    await recordTransaction(
      wallet.id,
      userId,
      'Credit',
      amount,
      description,
      actorId,
      relatedAuctionId,
    )
  })
}

/** Debit (remove funds) from a user's wallet. Throws if insufficient available balance. */
export async function debitWallet(
  userId: string,
  amount: number,
  description: string,
  actorId: string,
  relatedAuctionId?: string,
): Promise<void> {
  if (amount <= 0) throw new Error('Debit amount must be positive')

  await db.transaction('rw', db.wallets, db.walletTransactions, async () => {
    const wallet = await db.wallets.where('userId').equals(userId).first()
    if (!wallet) throw new Error('Wallet not found')
    const available = wallet.balance - wallet.reservedAmount
    if (available < amount) throw new Error('Insufficient wallet balance')
    await db.wallets.update(wallet.id, {
      balance: wallet.balance - amount,
      updatedAt: Date.now(),
    })
    await recordTransaction(
      wallet.id,
      userId,
      'Debit',
      amount,
      description,
      actorId,
      relatedAuctionId,
    )
  })
}

/**
 * Reserve an amount in the wallet (hold without deducting from balance).
 * Replaces any existing reservation for the same auction so re-bidding works correctly.
 */
export async function reserveForAuction(
  userId: string,
  auctionId: string,
  newReserveAmount: number,
  previousReserveAmount: number,
): Promise<void> {
  await db.transaction('rw', db.wallets, db.walletTransactions, async () => {
    const wallet = await db.wallets.where('userId').equals(userId).first()
    if (!wallet) throw new Error('Wallet not found')

    const delta = newReserveAmount - previousReserveAmount
    const available = wallet.balance - wallet.reservedAmount
    if (delta > 0 && available < delta)
      throw new Error('Insufficient wallet balance for deposit hold')

    await db.wallets.update(wallet.id, {
      reservedAmount: wallet.reservedAmount + delta,
      updatedAt: Date.now(),
    })
    if (delta !== 0) {
      const type: WalletTransactionType = delta > 0 ? 'Reserve' : 'Release'
      await recordTransaction(
        wallet.id,
        userId,
        type,
        Math.abs(delta),
        `Deposit hold adjusted for auction ${auctionId}`,
        userId,
        auctionId,
      )
    }
  })
}

/** Release the reserved hold when an auction ends without the user winning. */
export async function releaseReservation(
  userId: string,
  auctionId: string,
  reservedAmount: number,
): Promise<void> {
  if (reservedAmount <= 0) return

  await db.transaction('rw', db.wallets, db.walletTransactions, async () => {
    const wallet = await db.wallets.where('userId').equals(userId).first()
    if (!wallet) return
    await db.wallets.update(wallet.id, {
      reservedAmount: Math.max(0, wallet.reservedAmount - reservedAmount),
      updatedAt: Date.now(),
    })
    await recordTransaction(
      wallet.id,
      userId,
      'Release',
      reservedAmount,
      `Reservation released — auction ${auctionId}`,
      userId,
      auctionId,
    )
  })
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
  await db.transaction('rw', db.wallets, db.walletTransactions, async () => {
    const wallet = await db.wallets.where('userId').equals(userId).first()
    if (!wallet) throw new Error('Wallet not found')
    await db.wallets.update(wallet.id, {
      balance: wallet.balance - depositAmount,
      reservedAmount: Math.max(0, wallet.reservedAmount - depositAmount),
      updatedAt: Date.now(),
    })
    await recordTransaction(
      wallet.id,
      userId,
      'DepositDeducted',
      depositAmount,
      `Auction deposit deducted — won auction ${auctionId}`,
      userId,
      auctionId,
    )
  })
}
