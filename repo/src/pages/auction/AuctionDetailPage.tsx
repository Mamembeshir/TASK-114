import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Trophy, User } from 'lucide-react'
import { db } from '@/db'
import { useAuthStore } from '@/store/authStore'
import { usePermission } from '@/hooks/usePermission'
import { subscribeToBidEvents } from '@/services/biddingEngine'
import { Badge, Card, CardHeader, Spinner } from '@/components/ui'
import { CountdownTimer } from '@/components/auction/CountdownTimer'
import { BidForm } from '@/components/auction/BidForm'
import type { Auction, AuctionStatus, Bid } from '@/types'

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

interface Props {
  auctionId: string
}

export function AuctionDetailPage({ auctionId }: Props) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const canBid = usePermission('placeBid')

  const [auction, setAuction] = useState<Auction | null>(null)
  const [bids, setBids] = useState<Bid[]>([])
  const [userDepositHeld, setUserDepositHeld] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const loadAuction = useCallback(async () => {
    const [a, allBids] = await Promise.all([
      db.auctions.get(auctionId),
      db.bids.where('auctionId').equals(auctionId).sortBy('createdAt'),
    ])
    if (a) setAuction(a)
    setBids(allBids.reverse())

    // Check if current user has a deposit reserved
    if (currentUser) {
      const wallet = await db.wallets.where('userId').equals(currentUser.id).first()
      const hasActiveBid = allBids.some((b) => b.bidderId === currentUser.id)
      setUserDepositHeld(hasActiveBid && wallet ? (a?.depositAmount ?? 0) : 0)
    }
    setIsLoading(false)
  }, [auctionId, currentUser])

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
          This auction was extended by 2 minutes due to last-second bidding.
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
                  +{auction.minimumIncrement}
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
              <BidForm
                auction={auction}
                userDepositHeld={userDepositHeld}
                onBidPlaced={() => {
                  void loadAuction()
                }}
              />
            )}
          </Card>

          {/* Bid history */}
          <Card>
            <CardHeader title="Bid History" description={`${String(bids.length)} bids`} />
            {bids.length === 0 ? (
              <p className="text-sm text-surface-600 text-center py-4">No bids yet.</p>
            ) : (
              <div className="space-y-2">
                {bids.map((bid, i) => (
                  <div
                    key={bid.id}
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
                ))}
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
