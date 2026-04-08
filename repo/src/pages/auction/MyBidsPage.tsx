/**
 * MyBidsPage — participant view of all auctions they have bid on.
 */
import { useEffect, useState } from 'react'
import { Gavel } from 'lucide-react'
import { db } from '@/db'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { Badge, Card, EmptyState, Table } from '@/components/ui'
import { CountdownTimer } from '@/components/auction/CountdownTimer'
import type { ColumnDef } from '@/components/ui'
import type { Auction, AuctionStatus } from '@/types'

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

interface AuctionRow {
  auction: Auction
  myHighestBid: number
  isWinning: boolean
  isWon: boolean
}

export function MyBidsPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { openTab } = useTabStore()
  const [rows, setRows] = useState<AuctionRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!currentUser) return

    const load = async () => {
      // Get all bids by this user
      const myBids = await db.bids.where('bidderId').equals(currentUser.id).toArray()

      const auctionIds = [...new Set(myBids.map((b) => b.auctionId))]
      const auctions = await Promise.all(auctionIds.map((id) => db.auctions.get(id)))

      const result: AuctionRow[] = []
      for (const auction of auctions) {
        if (!auction) continue
        const auctionBids = myBids.filter((b) => b.auctionId === auction.id)
        const myHighestBid = Math.max(...auctionBids.map((b) => b.amount))
        const isWinning =
          (auction.status === 'Active' || auction.status === 'Extended') &&
          auction.currentPrice === myHighestBid
        const isWon = auction.status === 'Awarded' && auction.winnerId === currentUser.id
        result.push({ auction, myHighestBid, isWinning, isWon })
      }

      result.sort((a, b) => b.auction.endTime - a.auction.endTime)
      setRows(result)
      setIsLoading(false)
    }

    void load()
  }, [currentUser])

  if (!currentUser) return null

  const columns: ColumnDef<AuctionRow>[] = [
    {
      key: 'title',
      header: 'Auction',
      cell: (r) => (
        <button
          onClick={() => {
            openTab({
              id: `auction-${r.auction.id}`,
              title: r.auction.title,
              path: `/auctions/${r.auction.id}`,
            })
          }}
          className="text-primary-400 hover:underline text-left font-medium text-sm"
        >
          {r.auction.title}
        </button>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-28',
      cell: (r) => <Badge variant={STATUS_VARIANTS[r.auction.status]}>{r.auction.status}</Badge>,
    },
    {
      key: 'currentPrice',
      header: 'Current Price',
      width: 'w-28',
      cell: (r) => <span className="font-mono">{r.auction.currentPrice}</span>,
    },
    {
      key: 'myBid',
      header: 'My Highest Bid',
      width: 'w-28',
      cell: (r) => (
        <span
          className={[
            'font-mono font-semibold',
            r.isWinning ? 'text-emerald-400' : r.isWon ? 'text-primary-400' : 'text-surface-400',
          ].join(' ')}
        >
          {r.myHighestBid}
          {r.isWinning && <span className="ml-1 text-xs">✓ Leading</span>}
          {r.isWon && <span className="ml-1 text-xs">🏆 Won</span>}
        </span>
      ),
    },
    {
      key: 'endTime',
      header: 'Ends',
      width: 'w-32',
      cell: (r) =>
        r.auction.status === 'Active' || r.auction.status === 'Extended' ? (
          <CountdownTimer endTime={r.auction.endTime} />
        ) : (
          <span className="text-surface-600 text-xs">
            {new Date(r.auction.endTime).toLocaleDateString()}
          </span>
        ),
    },
  ]

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">My Bids</h1>
        <p className="text-sm text-surface-500 mt-0.5">Auctions you have participated in</p>
      </div>

      <Card padded={false}>
        {rows.length === 0 && !isLoading ? (
          <EmptyState
            icon={Gavel}
            title="No bids yet"
            description="Auctions you bid on will appear here."
          />
        ) : (
          <Table columns={columns} data={rows} rowKey={(r) => r.auction.id} isLoading={isLoading} />
        )}
      </Card>
    </div>
  )
}
