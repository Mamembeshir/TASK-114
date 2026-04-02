/**
 * Shared BroadcastChannel singleton for bid/auction events.
 * Imported by both biddingEngine and auctionLifecycle to keep them in sync.
 */

import type { Bid } from '@/types'

export type BidEvent =
  | { type: 'BID_PLACED'; auctionId: string; bid: Bid; newPrice: number }
  | { type: 'AUCTION_EXTENDED'; auctionId: string; newEndTime: number }
  | { type: 'AUCTION_CLOSED'; auctionId: string }

let _channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel {
  _channel ??= new BroadcastChannel('meridian_bids')
  return _channel
}

export function broadcast(event: BidEvent): void {
  getChannel().postMessage(event)
}

export function subscribeToBidEvents(handler: (event: BidEvent) => void): () => void {
  const ch = getChannel()
  const listener = (e: MessageEvent<BidEvent>) => {
    handler(e.data)
  }
  ch.addEventListener('message', listener)
  return () => {
    ch.removeEventListener('message', listener)
  }
}
