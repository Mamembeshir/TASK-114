/**
 * AuctionBrowsePage — participant view: live auction list with prices and countdowns.
 * Clicking an auction opens its detail page in a new tab.
 */
import { useCallback, useEffect, useState } from 'react'
import { Gavel } from 'lucide-react'
import { db } from '@/db'
import { useTabStore } from '@/store/tabStore'
import { subscribeToBidEvents } from '@/services/biddingEngine'
import { Badge, Card, EmptyState } from '@/components/ui'
import { CountdownTimer } from '@/components/auction/CountdownTimer'
import type { Auction, AuctionStatus } from '@/types'

const STATUS_VARIANTS: Record<
  AuctionStatus,
  'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
> = {
  Draft: 'default',
  Active: 'success',
  Extended: 'warning',
  Ended: 'default',
  Awarded: 'primary',
  NoSale: 'danger',
  Cancelled: 'danger',
}

export function AuctionBrowsePage() {
  const { openTab } = useTabStore()
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    const active = await db.auctions.where('status').anyOf('Active', 'Extended').toArray()
    setAuctions(active.sort((a, b) => a.endTime - b.endTime))
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Real-time updates from bid events
  useEffect(() => {
    return subscribeToBidEvents(() => {
      void load()
    })
  }, [load])

  const openDetail = (auction: Auction) => {
    openTab({ id: `auction-${auction.id}`, title: auction.title, path: `/auctions/${auction.id}` })
  }

  if (isLoading) return null

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">Live Auctions</h1>
        <p className="text-sm text-surface-500 mt-0.5">{auctions.length} active</p>
      </div>

      {auctions.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title="No active auctions"
          description="There are no live auctions at the moment. Check back soon."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {auctions.map((auction) => (
            <Card
              key={auction.id}
              className="cursor-pointer hover:border-surface-700 transition-colors"
              padded={false}
            >
              <button
                className="w-full text-left p-5 space-y-3"
                onClick={() => {
                  openDetail(auction)
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-surface-100 leading-snug">
                    {auction.title}
                  </h3>
                  <Badge variant={STATUS_VARIANTS[auction.status]}>{auction.status}</Badge>
                </div>

                {auction.description && (
                  <p className="text-xs text-surface-500 line-clamp-2">{auction.description}</p>
                )}

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <p className="text-xs text-surface-600">Current Price</p>
                    <p className="text-lg font-bold text-surface-50 font-mono">
                      {auction.currentPrice}
                    </p>
                  </div>
                  <CountdownTimer
                    endTime={auction.endTime}
                    onExpire={() => {
                      void load()
                    }}
                  />
                </div>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
