/**
 * AuctionLifecycle — closes ended auctions and runs a polling timer.
 *
 * Design decisions:
 *  - No bids → NoSale; notify seller; release all holds (CLAUDE.md #1)
 *  - Winner → Awarded; deduct deposit; notify all participants (CLAUDE.md #2)
 *  - Timer polls every 15 s; first tab to update status "wins" (idempotent guard)
 */

import { db } from '@/db'
import { writeAuditLog } from '@/utils/audit'
import { generateId } from '@/crypto'
import { deductDeposit, releaseReservation } from './walletService'
import { broadcast } from './bidChannel'
import type { Auction } from '@/types'

// ── closeAuction ───────────────────────────────────────────────────────────────

export async function closeAuction(auction: Auction): Promise<void> {
  if (!['Active', 'Extended', 'Ended'].includes(auction.status)) return

  const bids = await db.bids.where('auctionId').equals(auction.id).toArray()

  // ── No-bid scenario → NoSale ───────────────────────────────────────────────
  if (bids.length === 0) {
    await db.auctions.update(auction.id, { status: 'NoSale', updatedAt: Date.now() })

    await writeAuditLog({
      eventType: 'auction.no_sale',
      actorId: 'system',
      actorName: 'System',
      entityType: 'Auction',
      entityId: auction.id,
      description: `Auction "${auction.title}" ended with no bids — marked No Sale`,
    })

    await db.notifications.add({
      id: generateId(),
      userId: auction.createdBy,
      type: 'AuctionNoSale',
      title: 'Auction Ended — No Sale',
      message: `Your auction "${auction.title}" received no bids and has been marked as No Sale.`,
      isRead: false,
      relatedEntityType: 'Auction',
      relatedEntityId: auction.id,
      createdAt: Date.now(),
    })

    broadcast({ type: 'AUCTION_CLOSED', auctionId: auction.id })
    return
  }

  // ── Determine winner: highest amount; tie → earliest createdAt ─────────────
  const sorted = [...bids].sort((a, b) => b.amount - a.amount || a.createdAt - b.createdAt)
  const winning = sorted[0] as (typeof sorted)[number] | undefined
  if (!winning) return // guard — should not happen since bids.length > 0

  await db.transaction(
    'rw',
    [db.auctions, db.proxyBids, db.wallets, db.walletTransactions, db.notifications, db.auditLogs],
    async () => {
      await db.auctions.update(auction.id, {
        status: 'Awarded',
        winnerId: winning.bidderId,
        winningBidId: winning.id,
        updatedAt: Date.now(),
      })

      // Deactivate all proxy bids
      const proxies = await db.proxyBids.where('auctionId').equals(auction.id).toArray()
      await Promise.all(
        proxies.map((p) => db.proxyBids.update(p.id, { isActive: false, updatedAt: Date.now() })),
      )

      // Deduct deposit from winner
      await deductDeposit(winning.bidderId, auction.id, auction.depositAmount)

      // Release hold for all losing bidders
      const loserIds = [...new Set(bids.map((b) => b.bidderId))].filter(
        (id) => id !== winning.bidderId,
      )
      await Promise.all(
        loserIds.map((loserId) => releaseReservation(loserId, auction.id, auction.depositAmount)),
      )

      // Notify winner
      await db.notifications.add({
        id: generateId(),
        userId: winning.bidderId,
        type: 'AuctionWon',
        title: 'You Won the Auction!',
        message: `Congratulations! Your bid of ${String(winning.amount)} won "${auction.title}". A deposit of ${String(auction.depositAmount)} has been deducted from your wallet.`,
        isRead: false,
        relatedEntityType: 'Auction',
        relatedEntityId: auction.id,
        createdAt: Date.now(),
      })

      // Notify losers
      await Promise.all(
        loserIds.map((loserId) =>
          db.notifications.add({
            id: generateId(),
            userId: loserId,
            type: 'BidOutbid',
            title: 'Auction Ended',
            message: `The auction "${auction.title}" has ended. Your deposit hold has been released.`,
            isRead: false,
            relatedEntityType: 'Auction',
            relatedEntityId: auction.id,
            createdAt: Date.now(),
          }),
        ),
      )

      await writeAuditLog({
        eventType: 'auction.closed',
        actorId: 'system',
        actorName: 'System',
        entityType: 'Auction',
        entityId: auction.id,
        description: `Auction "${auction.title}" awarded to ${winning.bidderId} at ${String(winning.amount)}`,
      })
    },
  )

  broadcast({ type: 'AUCTION_CLOSED', auctionId: auction.id })
}

// ── Timer ──────────────────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null

/**
 * Start a 15-second polling loop that closes any auctions whose endTime has passed.
 * Returns a cleanup function — call it in a React useEffect cleanup.
 */
export function startAuctionLifecycleTimer(): () => void {
  const tick = async () => {
    const now = Date.now()
    const toClose = await db.auctions
      .where('status')
      .anyOf('Active', 'Extended')
      .filter((a) => a.endTime <= now)
      .toArray()

    for (const auction of toClose) {
      // Atomic guard: only process if we successfully transition to Ended
      const claimed = await db.transaction('rw', db.auctions, async () => {
        const fresh = await db.auctions.get(auction.id)
        if (!fresh || !['Active', 'Extended'].includes(fresh.status)) return false
        await db.auctions.update(auction.id, { status: 'Ended', updatedAt: Date.now() })
        return true
      })

      if (claimed) {
        const fresh = await db.auctions.get(auction.id)
        if (fresh) await closeAuction(fresh)
      }
    }
  }

  void tick()
  _timer = setInterval(() => {
    void tick()
  }, 15_000)

  return () => {
    if (_timer !== null) {
      clearInterval(_timer)
      _timer = null
    }
  }
}
