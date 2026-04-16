/**
 * Shared BroadcastChannel singleton for bid/auction events.
 * Imported by both biddingEngine and auctionLifecycle to keep them in sync.
 *
 * Architecture:
 *  - Cross-tab delivery: via BroadcastChannel (browser spec — does NOT deliver
 *    messages back to the originating context).
 *  - Same-context delivery: via a local subscriber set notified synchronously
 *    inside broadcast(). This makes the module fully testable without mocks and
 *    ensures same-tab UI updates are immediate.
 */

import type { Bid } from '@/types'

export type BidEvent =
  | { type: 'BID_PLACED'; auctionId: string; bid: Bid; newPrice: number }
  | { type: 'AUCTION_EXTENDED'; auctionId: string; newEndTime: number }
  | { type: 'AUCTION_CLOSED'; auctionId: string }

// ── In-process (same-context) subscribers ────────────────────────────────────

const _localHandlers = new Set<(event: BidEvent) => void>()

// ── Cross-tab BroadcastChannel ────────────────────────────────────────────────

let _channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel {
  _channel ??= new BroadcastChannel('meridian_bids')
  return _channel
}

// ── Public API ────────────────────────────────────────────────────────────────

export function broadcast(event: BidEvent): void {
  // Notify same-context subscribers first (synchronous, no BroadcastChannel quirks)
  for (const handler of _localHandlers) {
    handler(event)
  }
  // Then broadcast to other tabs via BroadcastChannel
  getChannel().postMessage(event)
}

export function subscribeToBidEvents(handler: (event: BidEvent) => void): () => void {
  _localHandlers.add(handler)

  // Also listen for events originating in OTHER tabs via BroadcastChannel
  const ch = getChannel()
  const crossTabListener = (e: MessageEvent<BidEvent>) => {
    handler(e.data)
  }
  ch.addEventListener('message', crossTabListener)

  return () => {
    _localHandlers.delete(handler)
    ch.removeEventListener('message', crossTabListener)
  }
}
