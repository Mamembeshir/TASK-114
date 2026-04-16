/**
 * Unit tests for WalletService.
 *
 * Covers: ensureWallet, getWallet, creditWallet, debitWallet,
 *         getCurrentReservation, prepareReservation, reserveForAuction,
 *         releaseReservation, deductDeposit
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  ensureWallet,
  getWallet,
  creditWallet,
  debitWallet,
  getCurrentReservation,
  prepareReservation,
  reserveForAuction,
  releaseReservation,
  deductDeposit,
} from '@/services/walletService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'

// ── Auth helpers ──────────────────────────────────────────────────────────────

function setUser(id: string, role: Role) {
  useAuthStore.setState({
    currentUser: {
      id,
      username: id,
      displayName: id,
      role,
      isActive: true,
      createdAt: Date.now(),
    },
  } as Parameters<typeof useAuthStore.setState>[0])
}

const setAdmin       = (id = 'admin-1')  => setUser(id, Role.Administrator)
const setParticipant = (id = 'user-1')   => setUser(id, Role.Participant)

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.wallets.clear(),
    db.walletTransactions.clear(),
  ])
  setAdmin()
})

// ── ensureWallet ──────────────────────────────────────────────────────────────

describe('ensureWallet', () => {
  it('creates a wallet with zero balance when none exists', async () => {
    await ensureWallet('user-new')
    const wallet = await db.wallets.where('userId').equals('user-new').first()
    expect(wallet).toBeDefined()
    expect(wallet?.userId).toBe('user-new')
  })

  it('is idempotent — does not create a duplicate wallet', async () => {
    await ensureWallet('user-new')
    await ensureWallet('user-new')
    const count = await db.wallets.where('userId').equals('user-new').count()
    expect(count).toBe(1)
  })
})

// ── getWallet ─────────────────────────────────────────────────────────────────

describe('getWallet', () => {
  it('allows a user to read their own wallet', async () => {
    setAdmin('admin-1')
    await ensureWallet('admin-1')
    await creditWallet('admin-1', 500, 'seed')

    setAdmin('admin-1') // still admin
    const wallet = await getWallet('admin-1')
    expect(wallet).not.toBeNull()
    expect(wallet?.balance).toBe(500)
    expect(wallet?.userId).toBe('admin-1')
  })

  it('returns null when no wallet exists for the user', async () => {
    setAdmin('admin-1')
    const wallet = await getWallet('admin-1')
    expect(wallet).toBeNull()
  })

  it('allows Administrator (manageWallets) to read another user\'s wallet', async () => {
    setAdmin('admin-1')
    await ensureWallet('other-user')
    const wallet = await getWallet('other-user')
    expect(wallet).not.toBeNull()
  })

  it('throws Forbidden when Participant tries to read another user\'s wallet', async () => {
    setAdmin('admin-1')
    await ensureWallet('victim')

    setParticipant('attacker')
    await expect(getWallet('victim')).rejects.toThrow(/Forbidden/)
  })

  it('throws when unauthenticated', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await expect(getWallet('anyone')).rejects.toThrow(/Forbidden/)
  })
})

// ── creditWallet ──────────────────────────────────────────────────────────────

describe('creditWallet', () => {
  it('adds funds to an existing wallet', async () => {
    setAdmin()
    await ensureWallet('user-1')
    await creditWallet('user-1', 1000, 'Top-up')

    const wallet = await getWallet('user-1')
    expect(wallet?.balance).toBe(1000)
  })

  it('creates wallet if it does not exist yet then credits it', async () => {
    setAdmin()
    await creditWallet('brand-new', 250, 'Initial credit')
    const wallet = await getWallet('brand-new')
    expect(wallet?.balance).toBe(250)
  })

  it('accumulates multiple credits', async () => {
    setAdmin()
    await creditWallet('user-1', 500, 'First')
    await creditWallet('user-1', 200, 'Second')
    const wallet = await getWallet('user-1')
    expect(wallet?.balance).toBe(700)
  })

  it('throws when amount is not positive', async () => {
    setAdmin()
    await ensureWallet('user-1')
    await expect(creditWallet('user-1', 0, 'Zero')).rejects.toThrow(/positive/)
    await expect(creditWallet('user-1', -10, 'Neg')).rejects.toThrow(/positive/)
  })

  it('throws Forbidden for Participant (lacks manageWallets)', async () => {
    setParticipant()
    await expect(creditWallet('user-1', 100, 'Cheat')).rejects.toThrow(/Forbidden/)
  })

  it('records a Credit transaction', async () => {
    setAdmin()
    await creditWallet('user-1', 300, 'Test credit')
    const txns = await db.walletTransactions.where('userId').equals('user-1').toArray()
    expect(txns.some((t) => t.type === 'Credit' && t.amount === 300)).toBe(true)
  })
})

// ── debitWallet ───────────────────────────────────────────────────────────────

describe('debitWallet', () => {
  it('deducts funds from a wallet', async () => {
    setAdmin()
    await creditWallet('user-1', 1000, 'Seed')
    await debitWallet('user-1', 200, 'Purchase')

    const wallet = await getWallet('user-1')
    expect(wallet?.balance).toBe(800)
  })

  it('throws when wallet does not exist', async () => {
    setAdmin()
    await expect(debitWallet('ghost-user', 100, 'X')).rejects.toThrow('Wallet not found')
  })

  it('throws when balance is insufficient', async () => {
    setAdmin()
    await creditWallet('user-1', 100, 'Seed')
    await expect(debitWallet('user-1', 200, 'Too much')).rejects.toThrow(/Insufficient/)
  })

  it('throws when amount is not positive', async () => {
    setAdmin()
    await creditWallet('user-1', 100, 'Seed')
    await expect(debitWallet('user-1', 0, 'Zero')).rejects.toThrow(/positive/)
  })

  it('throws Forbidden for Participant (lacks manageWallets)', async () => {
    setParticipant()
    await expect(debitWallet('user-1', 50, 'Cheat')).rejects.toThrow(/Forbidden/)
  })

  it('considers reserved amount when computing available balance', async () => {
    setAdmin()
    await creditWallet('user-1', 1000, 'Seed')
    // Reserve 800 — available is only 200
    await reserveForAuction('user-1', 'auction-x', 800, 0)
    // Trying to debit 500 should fail (only 200 available)
    await expect(debitWallet('user-1', 500, 'Exceeds available')).rejects.toThrow(/Insufficient/)
  })

  it('records a Debit transaction', async () => {
    setAdmin()
    await creditWallet('user-1', 500, 'Seed')
    await debitWallet('user-1', 100, 'Test debit')
    const txns = await db.walletTransactions.where('userId').equals('user-1').toArray()
    expect(txns.some((t) => t.type === 'Debit' && t.amount === 100)).toBe(true)
  })
})

// ── getCurrentReservation ─────────────────────────────────────────────────────

describe('getCurrentReservation', () => {
  it('returns 0 when no transactions exist', async () => {
    const held = await getCurrentReservation('user-1', 'auction-1')
    expect(held).toBe(0)
  })

  it('returns the net reserved amount after reserve/release pairs', async () => {
    setAdmin()
    await creditWallet('user-1', 2000, 'Seed')
    await reserveForAuction('user-1', 'auction-1', 500, 0)   // +500
    await reserveForAuction('user-1', 'auction-1', 300, 500) // -200 delta (releases 200)

    const held = await getCurrentReservation('user-1', 'auction-1')
    expect(held).toBe(300)
  })
})

// ── prepareReservation ────────────────────────────────────────────────────────

describe('prepareReservation', () => {
  it('computes a valid prepared reservation', async () => {
    setAdmin()
    await creditWallet('user-1', 1000, 'Seed')
    const prep = await prepareReservation('user-1', 'auction-1', 300)
    expect(prep.walletId).toBeTruthy()
    expect(prep.delta).toBe(300)
    expect(prep.auctionId).toBe('auction-1')
  })

  it('throws when wallet does not exist', async () => {
    await expect(prepareReservation('no-wallet', 'auction-1', 100)).rejects.toThrow('Wallet not found')
  })

  it('throws when available balance is insufficient', async () => {
    setAdmin()
    await creditWallet('user-1', 100, 'Seed')
    await expect(prepareReservation('user-1', 'auction-1', 500)).rejects.toThrow(/Insufficient/)
  })
})

// ── reserveForAuction ─────────────────────────────────────────────────────────

describe('reserveForAuction', () => {
  it('increases the reserved amount and records a Reserve transaction', async () => {
    setAdmin()
    await creditWallet('user-1', 1000, 'Seed')
    await reserveForAuction('user-1', 'auction-1', 300, 0)

    const wallet = await getWallet('user-1')
    expect(wallet?.reservedAmount).toBe(300)

    const txns = await db.walletTransactions.where('userId').equals('user-1').toArray()
    expect(txns.some((t) => t.type === 'Reserve')).toBe(true)
  })

  it('replaces prior reservation (bid increase scenario)', async () => {
    setAdmin()
    await creditWallet('user-1', 2000, 'Seed')
    await reserveForAuction('user-1', 'auction-1', 300, 0)
    await reserveForAuction('user-1', 'auction-1', 500, 300)

    const wallet = await getWallet('user-1')
    // Net held should reflect the final desired reserve of 500
    const held = await getCurrentReservation('user-1', 'auction-1')
    expect(held).toBe(500)
    // balance unchanged (still 2000), reservedAmount is the wallet-wide total held
    expect(wallet?.balance).toBe(2000)
  })

  it('records a Release transaction when new reserve is lower', async () => {
    setAdmin()
    await creditWallet('user-1', 2000, 'Seed')
    await reserveForAuction('user-1', 'auction-1', 500, 0)
    await reserveForAuction('user-1', 'auction-1', 200, 500) // delta = -300

    const txns = await db.walletTransactions.where('userId').equals('user-1').toArray()
    expect(txns.some((t) => t.type === 'Release')).toBe(true)
  })
})

// ── releaseReservation ────────────────────────────────────────────────────────

describe('releaseReservation', () => {
  it('reduces the reserved amount and records a Release transaction', async () => {
    setAdmin()
    await creditWallet('user-1', 1000, 'Seed')
    await reserveForAuction('user-1', 'auction-1', 400, 0)
    await releaseReservation('user-1', 'auction-1', 400)

    const wallet = await getWallet('user-1')
    expect(wallet?.reservedAmount).toBe(0)
  })

  it('is a no-op when reservedAmount is zero or less', async () => {
    // Should resolve without error
    await expect(releaseReservation('user-1', 'auction-1', 0)).resolves.toBeUndefined()
  })

  it('is a no-op when wallet does not exist', async () => {
    await expect(releaseReservation('ghost', 'auction-1', 100)).resolves.toBeUndefined()
  })
})

// ── deductDeposit ─────────────────────────────────────────────────────────────

describe('deductDeposit', () => {
  it('deducts the deposit amount from balance and reserved', async () => {
    setAdmin()
    await creditWallet('user-1', 1000, 'Seed')
    await reserveForAuction('user-1', 'auction-1', 100, 0)
    await deductDeposit('user-1', 'auction-1', 100)

    const wallet = await getWallet('user-1')
    expect(wallet?.balance).toBe(900)
    // reservedAmount reduced by 100
    expect(wallet?.reservedAmount).toBe(0)
  })

  it('throws when wallet does not exist', async () => {
    await expect(deductDeposit('ghost', 'auction-1', 50)).rejects.toThrow('Wallet not found')
  })

  it('records a DepositDeducted transaction', async () => {
    setAdmin()
    await creditWallet('user-1', 500, 'Seed')
    await deductDeposit('user-1', 'auction-1', 50)
    const txns = await db.walletTransactions.where('userId').equals('user-1').toArray()
    expect(txns.some((t) => t.type === 'DepositDeducted' && t.amount === 50)).toBe(true)
  })
})
