/**
 * BiddingEngine — deterministic, cross-tab-safe bidding.
 *
 * Design decisions (CLAUDE.md #3, #4, #10):
 *  - Minimum increment enforced on every bid
 *  - Proxy bids auto-resolved: highest maxAmount wins; ties broken by earliest proxy
 *  - Anti-sniping: extends end time by 2 min once when bid lands in final 30 s
 *  - Idempotency key prevents duplicate bids from cross-tab races
 *  - BroadcastChannel notifies all open tabs of price changes
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import { writeAuditLog } from '@/utils/audit'
import { requirePermission } from '@/utils/permissions'
import { reserveForAuction } from './walletService'
import { broadcast } from './bidChannel'
import { createNotification } from './notificationService'
import type { Bid } from '@/types'

export { subscribeToBidEvents } from './bidChannel'
export type { BidEvent } from './bidChannel'

// ── Constants ─────────────────────────────────────────────────────────────────

const SNIPE_WINDOW_MS = 30_000 // 30 seconds before end time
const SNIPE_EXTENSION_MS = 2 * 60_000 // 2-minute extension

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
 */
async function resolveProxies(
  auctionId: string,
  incomingAmount: number,
  incomingBidderId: string,
  minimumIncrement: number,
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

  // Competing proxy outbids — raise just enough above incoming
  const counterAmount = Math.min(top.maxAmount, incomingAmount + minimumIncrement)
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
  bidderId: string,
  bidderName: string,
  amount: number,
  idempotencyKey: string,
  depositAmount: number,
  previousDepositHeld: number,
): Promise<PlaceBidResult> {
  requirePermission('placeBid')
  // Collect outbid info outside the transaction to avoid accessing db.notifications
  // inside a transaction that doesn't list it (IndexedDB constraint).
  let outbidUserId: string | undefined
  let outbidAuctionTitle: string | undefined
  let outbidNewPrice: number | undefined

  const result = await db.transaction(
    'rw',
    [db.auctions, db.bids, db.proxyBids, db.wallets, db.walletTransactions, db.auditLogs],
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
      if (Date.now() > auction.endTime) {
        return {
          success: false,
          newPrice: auction.currentPrice,
          message: 'Auction has ended',
          extended: false,
        }
      }

      const minRequired = auction.currentPrice + auction.minimumIncrement
      if (amount < minRequired) {
        return {
          success: false,
          newPrice: auction.currentPrice,
          message: `Minimum bid is ${String(minRequired)}`,
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
      )

      // Anti-sniping: extend once if bid lands in final 30 s
      let extended = false
      let newEndTime = auction.endTime
      if (!auction.antiSnipingTriggered && auction.endTime - Date.now() <= SNIPE_WINDOW_MS) {
        newEndTime = auction.endTime + SNIPE_EXTENSION_MS
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

      // Reserve deposit in wallet (updates/replaces previous hold)
      await reserveForAuction(bidderId, auctionId, depositAmount, previousDepositHeld)

      await writeAuditLog({
        eventType: 'bid.placed',
        actorId: bidderId,
        actorName: bidderName,
        entityType: 'Auction',
        entityId: auctionId,
        description: `${bidderName} bid ${String(amount)} on auction ${auctionId}`,
      })

      const finalBid = counterBid ?? bid

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

  // Send outbid notification outside the transaction (db.notifications not in scope above)
  if (outbidUserId !== undefined && outbidNewPrice !== undefined) {
    await createNotification({
      userId: outbidUserId,
      type: 'BidOutbid',
      title: 'You Were Outbid',
      message: `Someone placed a higher bid on "${outbidAuctionTitle ?? auctionId}". New price: ${String(outbidNewPrice)}.`,
      relatedEntityType: 'Auction',
      relatedEntityId: auctionId,
    })
  }

  return result
}

// ── setProxyBid ────────────────────────────────────────────────────────────────

export async function setProxyBid(
  auctionId: string,
  bidderId: string,
  bidderName: string,
  maxAmount: number,
  depositAmount: number,
  previousDepositHeld: number,
): Promise<{ success: boolean; message: string }> {
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

    await reserveForAuction(bidderId, auctionId, depositAmount, previousDepositHeld)
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
  const minBid = auction.currentPrice + auction.minimumIncrement
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
