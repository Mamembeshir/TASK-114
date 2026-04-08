import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Clock, Trophy, User } from 'lucide-react'
import { db } from '@/db'
import { useAuthStore } from '@/store/authStore'
import { usePermission } from '@/hooks/usePermission'
import { subscribeToBidEvents } from '@/services/biddingEngine'
import { getAuction as getAuctionService, activateIfDue } from '@/services/auctionService'
import { getMinimumIncrement } from '@/utils/increment'
import { Badge, Button, Card, CardHeader, Modal, Spinner } from '@/components/ui'
import { CountdownTimer } from '@/components/auction/CountdownTimer'
import { BidForm } from '@/components/auction/BidForm'
import type { Auction, AuctionExtensionEvent, AuctionStatus, Bid } from '@/types'

const STATUS_VARIANTS: Record<
  AuctionStatus,
  'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
> = {
  Draft: 'default',
  Scheduled: 'info',
  Active: 'success',
  Extended: 'warning',
  Ended: 'default',
  Awarded: 'primary',
  NoSale: 'danger',
  Cancelled: 'danger',
}

interface Props {
  auctionId: string
}

export function AuctionDetailPage({ auctionId }: Props) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const canBid = usePermission('placeBid')

  const [auction, setAuction] = useState<Auction | null>(null)
  const [bids, setBids] = useState<Bid[]>([])
  const [extensionEvents, setExtensionEvents] = useState<AuctionExtensionEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showBidModal, setShowBidModal] = useState(false)

  const loadAuction = useCallback(async () => {
    // Transition Scheduled → Active if start time has arrived
    await activateIfDue(auctionId)
    const [a, allBids, extensions] = await Promise.all([
      getAuctionService(auctionId),
      db.bids.where('auctionId').equals(auctionId).sortBy('createdAt'),
      db.auctionExtensionEvents.where('auctionId').equals(auctionId).sortBy('createdAt'),
    ])
    if (a) setAuction(a)
    setBids(allBids.reverse())
    setExtensionEvents(extensions)
    setIsLoading(false)
  }, [auctionId])

  useEffect(() => {
    void loadAuction()
  }, [loadAuction])

  // Live updates from other tabs / this tab
  useEffect(() => {
    return subscribeToBidEvents((event) => {
      if (event.auctionId === auctionId) {
        void loadAuction()
      }
    })
  }, [auctionId, loadAuction])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!auction) {
    return <div className="p-6 text-surface-500 text-sm">Auction not found.</div>
  }

  const isOpen = auction.status === 'Active' || auction.status === 'Extended'
  const isWinner = auction.winnerId && auction.winnerId === currentUser?.id

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-surface-50 leading-tight">{auction.title}</h1>
          <p className="text-surface-500 text-sm mt-1">{auction.description}</p>
        </div>
        <Badge variant={STATUS_VARIANTS[auction.status]}>{auction.status}</Badge>
      </div>

      {/* Anti-sniping notice */}
      {auction.antiSnipingTriggered && isOpen && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          This auction has been extended due to last-second bidding. Each bid in the final 30 seconds adds 2 minutes.
        </div>
      )}

      {/* Winner notice */}
      {isWinner && (
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-emerald-400 text-sm">
          <Trophy className="w-4 h-4 shrink-0" />
          Congratulations — you won this auction!
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: price + countdown + bid form */}
        <div className="md:col-span-2 space-y-4">
          <Card>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-surface-500 mb-1">Current Price</p>
                <p className="text-2xl font-bold text-surface-50 font-mono">
                  {auction.currentPrice}
                </p>
              </div>
              <div>
                <p className="text-xs text-surface-500 mb-1">Min Increment</p>
                <p className="text-lg font-semibold text-surface-300 font-mono">
                  +{getMinimumIncrement(auction.currentPrice, auction.incrementTiers, auction.minimumIncrement)}
                </p>
              </div>
              <div>
                <p className="text-xs text-surface-500 mb-1">{isOpen ? 'Ends in' : 'Ended'}</p>
                <CountdownTimer
                  endTime={auction.endTime}
                  onExpire={() => {
                    void loadAuction()
                  }}
                />
              </div>
            </div>

            {canBid && isOpen && (
              <Button
                onClick={() => { setShowBidModal(true) }}
              >
                Place Bid
              </Button>
            )}

            {/* Bid Modal */}
            <Modal
              open={showBidModal}
              onClose={() => { setShowBidModal(false) }}
              title="Place a Bid"
              description={`Current price: ${String(auction.currentPrice)} · Deposit: ${String(auction.depositAmount)}`}
            >
              <BidForm
                auction={auction}
                onBidPlaced={() => {
                  setShowBidModal(false)
                  void loadAuction()
                }}
              />
            </Modal>
          </Card>

          {/* Bid history */}
          <Card>
            <CardHeader title="Bid History" description={`${String(bids.length)} bids`} />
            {bids.length === 0 ? (
              <p className="text-sm text-surface-600 text-center py-4">No bids yet.</p>
            ) : (
              <div className="space-y-2">
                {bids.map((bid, i) => {
                  // Find extension events triggered by this bid
                  const extensions = extensionEvents.filter((e) => e.triggeringBidId === bid.id)

                  return (
                    <div key={bid.id}>
                      <div
                        className={[
                          'flex items-center justify-between px-3 py-2 rounded-lg',
                          i === 0
                            ? 'bg-primary-600/10 border border-primary-600/20'
                            : 'bg-surface-800/40',
                        ].join(' ')}
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-surface-600 shrink-0" />
                          <span className="text-xs text-surface-400">
                            {bid.bidderId === currentUser?.id
                              ? 'You'
                              : `Bidder …${bid.bidderId.slice(-4)}`}
                            {bid.isProxyResolved && (
                              <span className="ml-1 text-surface-600">(proxy)</span>
                            )}
                          </span>
                        </div>
                        <div className="text-right">
                          <span
                            className={[
                              'font-mono text-sm font-semibold',
                              i === 0 ? 'text-primary-400' : 'text-surface-300',
                            ].join(' ')}
                          >
                            {bid.amount}
                          </span>
                          <span className="text-xs text-surface-600 ml-2">
                            {new Date(bid.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                      {extensions.map((ext) => (
                        <div key={ext.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/20 text-amber-400 text-xs mt-2">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>Auction extended +2 min (anti-sniping)</span>
                          <span className="ml-auto text-amber-500/60">
                            {new Date(ext.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right column: auction info */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Auction Info" />
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-surface-600 text-xs">Start Price</dt>
                <dd className="text-surface-300 font-mono">{auction.startPrice}</dd>
              </div>
              <div>
                <dt className="text-surface-600 text-xs">Deposit</dt>
                <dd className="text-surface-300 font-mono">{auction.depositAmount}</dd>
              </div>
              <div>
                <dt className="text-surface-600 text-xs">Starts</dt>
                <dd className="text-surface-300">{new Date(auction.startTime).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-surface-600 text-xs">Ends</dt>
                <dd className="text-surface-300">{new Date(auction.endTime).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-surface-600 text-xs">Total Bids</dt>
                <dd className="text-surface-300">{bids.length}</dd>
              </div>
              <div>
                <dt className="text-surface-600 text-xs">Anti-sniping</dt>
                <dd className="text-surface-300">
                  {auction.antiSnipingTriggered ? 'Triggered' : 'Not triggered'}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}
