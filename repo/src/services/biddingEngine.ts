/**
 * BiddingEngine — deterministic, cross-tab-safe bidding.
 *
 * Design decisions (CLAUDE.md #3, #4, #10):
 *  - Minimum increment enforced on every bid
 *  - Proxy bids auto-resolved: highest maxAmount wins; ties broken by earliest proxy
 *  - Anti-sniping: extends end time by 2 min on every bid that lands in final 30 s
 *  - Idempotency key prevents duplicate bids from cross-tab races
 *  - BroadcastChannel notifies all open tabs of price changes
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import { writeAuditLog } from '@/utils/audit'
import { requirePermission } from '@/utils/permissions'
import { getMinimumIncrement } from '@/utils/increment'
import { prepareReservation, applyReservationInTx } from './walletService'
import type { PreparedReservation } from './walletService'
import { broadcast } from './bidChannel'
import { acquireBidLock, releaseBidLock } from './bidLockManager'
import { useAuthStore } from '@/store/authStore'
import { notify } from './notificationService'
import type { Bid } from '@/types'

export { subscribeToBidEvents } from './bidChannel'
export type { BidEvent } from './bidChannel'

// ── Constants (fallback defaults when no systemConfig row exists) ─────────────

const DEFAULT_SNIPE_WINDOW_MS = 30_000 // 30 seconds before end time
const DEFAULT_SNIPE_EXTENSION_MS = 2 * 60_000 // 2-minute extension

/** Read anti-sniping timing from admin-configured systemConfig, falling back to defaults. */
async function getSnipeConfig(): Promise<{ windowMs: number; extensionMs: number }> {
  const cfg = await db.systemConfig.get('singleton')
  return {
    windowMs: cfg?.antiSnipingWindowSeconds
      ? cfg.antiSnipingWindowSeconds * 1000
      : DEFAULT_SNIPE_WINDOW_MS,
    extensionMs: cfg?.antiSnipingExtensionMinutes
      ? cfg.antiSnipingExtensionMinutes * 60_000
      : DEFAULT_SNIPE_EXTENSION_MS,
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

async function insertBid(
  auctionId: string,
  bidderId: string,
  amount: number,
  isProxyResolved: boolean,
  idempotencyKey: string,
): Promise<Bid> {
  const bid: Bid = {
    id: generateId(),
    auctionId,
    bidderId,
    amount,
    isProxyResolved,
    idempotencyKey,
    createdAt: Date.now(),
  }
  await db.bids.add(bid)
  return bid
}

/**
 * After a manual bid at `incomingAmount` from `incomingBidderId`, check whether
 * a competing proxy can outbid it and auto-counter if so.
 * Uses the tier-aware increment so proxy counter-bids also respect price bands.
 */
async function resolveProxies(
  auctionId: string,
  incomingAmount: number,
  incomingBidderId: string,
  minimumIncrement: number,
  incrementTiers?: import('@/types').IncrementTier[],
): Promise<{ winningBidderId: string; winningAmount: number; counterBid: Bid | null }> {
  const proxies = await db.proxyBids
    .where('auctionId')
    .equals(auctionId)
    .filter((p) => p.isActive && p.bidderId !== incomingBidderId)
    .toArray()

  // Highest maxAmount first; ties broken by earliest proxy (createdAt asc)
  proxies.sort((a, b) => b.maxAmount - a.maxAmount || a.createdAt - b.createdAt)

  const top = proxies[0] as (typeof proxies)[number] | undefined
  if (!top || top.maxAmount <= incomingAmount) {
    return { winningBidderId: incomingBidderId, winningAmount: incomingAmount, counterBid: null }
  }

  // Counter-bid increment is tier-aware: use the increment band for the incoming price
  const counterIncrement = getMinimumIncrement(incomingAmount, incrementTiers, minimumIncrement)
  // Competing proxy outbids — raise just enough above incoming
  const counterAmount = Math.min(top.maxAmount, incomingAmount + counterIncrement)
  const counterBid = await insertBid(auctionId, top.bidderId, counterAmount, true, generateId())

  return { winningBidderId: top.bidderId, winningAmount: counterAmount, counterBid }
}

// ── placeBid ───────────────────────────────────────────────────────────────────

export interface PlaceBidResult {
  success: boolean
  bid?: Bid
  newPrice: number
  message: string
  extended: boolean
}

export async function placeBid(
  auctionId: string,
  _bidderId: string,
  _bidderName: string,
  amount: number,
  idempotencyKey: string,
  depositAmount: number,
  _previousDepositHeld?: number,
): Promise<PlaceBidResult> {
  requirePermission('placeBid')
  const currentUser = useAuthStore.getState().currentUser!
  const bidderId = currentUser.id
  const bidderName = currentUser.displayName

  // Pre-flight: validate auction before doing expensive wallet crypto work.
  // This also avoids throwing "Wallet not found" on tests that only seed a wallet
  // for valid auction scenarios — the more useful error is "Auction not found".
  const preCheck = await db.auctions.get(auctionId)
  if (!preCheck) return { success: false, newPrice: 0, message: 'Auction not found', extended: false }
  if (preCheck.status !== 'Active' && preCheck.status !== 'Extended') {
    return {
      success: false,
      newPrice: preCheck.currentPrice,
      message: 'Auction is not accepting bids',
      extended: false,
    }
  }
  if (Date.now() < preCheck.startTime) {
    return {
      success: false,
      newPrice: preCheck.currentPrice,
      message: 'Auction has not started yet',
      extended: false,
    }
  }

  // Acquire the per-auction lock before entering the critical section.
  // This provides the explicit per-auction lock primitive required by decision #10,
  // complementing the Dexie transaction (atomicity) and idempotency key (dedup).
  const lockHolderId = await acquireBidLock(auctionId)
  if (!lockHolderId) {
    return {
      success: false,
      newPrice: preCheck.currentPrice,
      message: 'Another bid is currently being processed for this auction — please retry',
      extended: false,
    }
  }

  // Read admin-configured anti-sniping settings outside the transaction.
  const { windowMs: snipeWindowMs, extensionMs: snipeExtensionMs } = await getSnipeConfig()

  // Pre-compute the encrypted wallet reservation outside the transaction so that
  // Web Crypto `await` calls don't escape Dexie's microtask zone (PrematureCommitError).
  // Prior hold is computed service-side from persisted wallet transactions.
  const walletReservation = await prepareReservation(
    bidderId,
    auctionId,
    depositAmount,
  )

  // Collect outbid info outside the transaction to avoid accessing db.notifications
  // inside a transaction that doesn't list it (IndexedDB constraint).
  let outbidUserId: string | undefined
  let outbidAuctionTitle: string | undefined
  let outbidNewPrice: number | undefined

  const result = await db.transaction(
    'rw',
    [db.auctions, db.bids, db.proxyBids, db.wallets, db.walletTransactions, db.auditLogs, db.auctionExtensionEvents],
    async () => {
      const auction = await db.auctions.get(auctionId)
      if (!auction)
        return { success: false, newPrice: 0, message: 'Auction not found', extended: false }

      if (auction.status !== 'Active' && auction.status !== 'Extended') {
        return {
          success: false,
          newPrice: auction.currentPrice,
          message: 'Auction is not accepting bids',
          extended: false,
        }
      }
      if (Date.now() < auction.startTime) {
        return {
          success: false,
          newPrice: auction.currentPrice,
          message: 'Auction has not started yet',
          extended: false,
        }
      }
      if (Date.now() > auction.endTime) {
        return {
          success: false,
          newPrice: auction.currentPrice,
          message: 'Auction has ended',
          extended: false,
        }
      }

      const minIncrement = getMinimumIncrement(
        auction.currentPrice,
        auction.incrementTiers,
        auction.minimumIncrement,
      )
      const minRequired = auction.currentPrice + minIncrement
      if (amount < minRequired) {
        return {
          success: false,
          newPrice: auction.currentPrice,
          message: `Minimum bid is ${String(minRequired)} (increment: ${String(minIncrement)})`,
          extended: false,
        }
      }

      // Idempotency check
      const existing = await db.bids.where('idempotencyKey').equals(idempotencyKey).first()
      if (existing) {
        return {
          success: true,
          bid: existing,
          newPrice: auction.currentPrice,
          message: 'Already placed',
          extended: false,
        }
      }

      // Capture previous leader for outbid notification
      const prevBids = await db.bids.where('auctionId').equals(auctionId).sortBy('amount')
      const previousLeaderId =
        prevBids.length > 0 ? prevBids[prevBids.length - 1]?.bidderId : undefined

      // Place the manual bid
      const bid = await insertBid(auctionId, bidderId, amount, false, idempotencyKey)

      // Resolve any competing proxy bids
      const { winningBidderId, winningAmount, counterBid } = await resolveProxies(
        auctionId,
        amount,
        bidderId,
        auction.minimumIncrement,
        auction.incrementTiers,
      )

      // Anti-sniping: every bid that lands within the configured window extends
      // the end time by the configured amount (defaults: 30 s window / 2 min extension).
      // Multiple extensions are allowed — each snipe resets the clock.
      let extended = false
      let newEndTime = auction.endTime
      if (auction.endTime - Date.now() <= snipeWindowMs) {
        newEndTime = auction.endTime + snipeExtensionMs
        extended = true
      }

      await db.auctions.update(auctionId, {
        currentPrice: winningAmount,
        updatedAt: Date.now(),
        ...(extended
          ? {
              endTime: newEndTime,
              status: 'Extended',
              antiSnipingTriggered: true,
              antiSnipingTriggeredAt: Date.now(),
            }
          : {}),
      })

      // Persist anti-sniping extension as a first-class event for timeline tracing
      const finalBid = counterBid ?? bid
      if (extended) {
        await db.auctionExtensionEvents.add({
          id: generateId(),
          auctionId,
          triggeringBidId: finalBid.id,
          previousEndTime: auction.endTime,
          newEndTime,
          createdAt: Date.now(),
        })
      }

      // Apply pre-computed wallet reservation (pure DB writes — no crypto inside tx)
      await applyReservationInTx(walletReservation)

      await writeAuditLog({
        eventType: 'bid.placed',
        actorId: bidderId,
        actorName: bidderName,
        entityType: 'Auction',
        entityId: auctionId,
        description: `${bidderName} bid ${String(amount)} on auction ${auctionId}`,
      })

      broadcast({ type: 'BID_PLACED', auctionId, bid: finalBid, newPrice: winningAmount })
      if (extended) broadcast({ type: 'AUCTION_EXTENDED', auctionId, newEndTime })

      const userWon = winningBidderId === bidderId

      // Record outbid info to notify after the transaction
      if (previousLeaderId && previousLeaderId !== winningBidderId) {
        outbidUserId = previousLeaderId
        outbidAuctionTitle = auction.title
        outbidNewPrice = winningAmount
      }

      return {
        success: true,
        bid: finalBid,
        newPrice: winningAmount,
        message: userWon ? 'Bid placed successfully!' : 'You were outbid by a proxy bid',
        extended,
      }
    },
  )

  try {
    // Send outbid notification outside the transaction (db.notifications not in scope above)
    if (outbidUserId !== undefined && outbidNewPrice !== undefined) {
      await notify({
        userId: outbidUserId,
        type: 'BidOutbid',
        title: 'You Were Outbid',
        message: `Someone placed a higher bid on "${outbidAuctionTitle ?? auctionId}". New price: ${String(outbidNewPrice)}.`,
        relatedEntityType: 'Auction',
        relatedEntityId: auctionId,
      })
    }
  } finally {
    // Always release the per-auction lock, even if notification delivery fails
    await releaseBidLock(auctionId, lockHolderId)
  }

  return result
}

// ── setProxyBid ────────────────────────────────────────────────────────────────

export async function setProxyBid(
  auctionId: string,
  _bidderId: string,
  _bidderName: string,
  maxAmount: number,
  depositAmount: number,
  _previousDepositHeld?: number,
): Promise<{ success: boolean; message: string }> {
  requirePermission('placeBid')
  const currentUser = useAuthStore.getState().currentUser!
  const bidderId = currentUser.id
  const bidderName = currentUser.displayName
  const auction = await db.auctions.get(auctionId)
  if (!auction) return { success: false, message: 'Auction not found' }
  if (auction.status !== 'Active' && auction.status !== 'Extended') {
    return { success: false, message: 'Auction is not accepting bids' }
  }
  if (maxAmount <= auction.currentPrice) {
    return {
      success: false,
      message: `Proxy max must exceed current price (${String(auction.currentPrice)})`,
    }
  }

  // Pre-compute wallet reservation outside the transaction (Web Crypto compat)
  // Prior hold is computed service-side from persisted wallet transactions.
  const proxyReservation: PreparedReservation = await prepareReservation(
    bidderId,
    auctionId,
    depositAmount,
  )

  await db.transaction('rw', db.proxyBids, db.wallets, db.walletTransactions, async () => {
    // Deactivate existing proxy for this bidder on this auction
    const existing = await db.proxyBids
      .where('auctionId')
      .equals(auctionId)
      .filter((p) => p.bidderId === bidderId && p.isActive)
      .first()

    if (existing) {
      await db.proxyBids.update(existing.id, { isActive: false, updatedAt: Date.now() })
    }

    await db.proxyBids.add({
      id: generateId(),
      auctionId,
      bidderId,
      maxAmount,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await applyReservationInTx(proxyReservation)
  })

  await writeAuditLog({
    eventType: 'bid.proxy_resolved',
    actorId: bidderId,
    actorName: bidderName,
    entityType: 'Auction',
    entityId: auctionId,
    description: `${bidderName} set proxy bid (max ${String(maxAmount)}) on auction ${auctionId}`,
  })

  // Immediately fire a bid at the minimum to trigger proxy resolution
  const minBid = auction.currentPrice + getMinimumIncrement(auction.currentPrice, auction.incrementTiers, auction.minimumIncrement)
  if (maxAmount >= minBid) {
    await placeBid(
      auctionId,
      bidderId,
      bidderName,
      minBid,
      generateId(),
      depositAmount,
      depositAmount,
    )
  }

  return { success: true, message: 'Proxy bid set successfully' }
}
