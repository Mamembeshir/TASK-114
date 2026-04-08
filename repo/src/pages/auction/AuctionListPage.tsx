import { useCallback, useEffect, useState } from 'react'
import { Gavel, PlusCircle } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/db'
import { cancelAuction, publishAuction } from '@/services/auctionService'
import { useAuthStore } from '@/store/authStore'
import { usePermission } from '@/hooks/usePermission'
import { useTabStore } from '@/store/tabStore'
import { generateId } from '@/crypto'
import type { ColumnDef } from '@/components/ui'
import { Badge, Button, Card, EmptyState, Select, Table } from '@/components/ui'
import { CountdownTimer } from '@/components/auction/CountdownTimer'
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

export function AuctionListPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { openTab } = useTabStore()
  const canCreate = usePermission('createAuction')
  const canManage = usePermission('manageAuctions')

  const [auctions, setAuctions] = useState<Auction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<AuctionStatus | ''>('')

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const all = await db.auctions.toCollection().sortBy('createdAt')
      const filtered = statusFilter ? all.filter((a) => a.status === statusFilter) : all
      setAuctions(filtered.reverse())
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  if (!currentUser) return null

  const openDetail = (auctionId: string, title: string) => {
    openTab({ id: `auction-${auctionId}`, title, path: `/auctions/${auctionId}` })
  }

  const openCreate = () => {
    openTab({ id: `auction-new-${generateId()}`, title: 'New Auction', path: '/auctions/new' })
  }

  const openEdit = (auctionId: string, title: string) => {
    openTab({
      id: `auction-edit-${auctionId}`,
      title: `Edit: ${title}`,
      path: `/auctions/${auctionId}/edit`,
    })
  }

  const handlePublish = async (auction: Auction) => {
    try {
      await publishAuction(auction.id)
      toast.success(`"${auction.title}" published`)
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish')
    }
  }

  const handleCancel = async (auction: Auction) => {
    if (!window.confirm(`Cancel auction "${auction.title}"?`)) return
    try {
      await cancelAuction(auction.id)
      toast.success('Auction cancelled')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel')
    }
  }

  const columns: ColumnDef<Auction>[] = [
    {
      key: 'title',
      header: 'Title',
      cell: (a) => (
        <button
          onClick={() => {
            openDetail(a.id, a.title)
          }}
          className="text-primary-400 hover:underline text-left font-medium"
        >
          {a.title}
        </button>
      ),
      sortable: true,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-28',
      cell: (a) => <Badge variant={STATUS_VARIANTS[a.status]}>{a.status}</Badge>,
      sortable: true,
    },
    {
      key: 'currentPrice',
      header: 'Price',
      width: 'w-24',
      cell: (a) => <span className="font-mono">{a.currentPrice}</span>,
      sortable: true,
    },
    {
      key: 'endTime',
      header: 'Ends',
      width: 'w-32',
      cell: (a) =>
        a.status === 'Active' || a.status === 'Extended' ? (
          <CountdownTimer
            endTime={a.endTime}
            onExpire={() => {
              void load()
            }}
          />
        ) : (
          <span className="text-surface-600 text-xs">
            {new Date(a.endTime).toLocaleDateString()}
          </span>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-40',
      cell: (a) => (
        <div className="flex items-center gap-2">
          {a.status === 'Draft' && canCreate && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                openEdit(a.id, a.title)
              }}
            >
              Edit
            </Button>
          )}
          {a.status === 'Draft' && canCreate && (
            <Button
              size="sm"
              onClick={() => {
                void handlePublish(a)
              }}
            >
              Publish
            </Button>
          )}
          {['Active', 'Extended', 'Draft'].includes(a.status) && canManage && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                void handleCancel(a)
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-surface-100">Auctions</h1>
          <p className="text-sm text-surface-500 mt-0.5">{auctions.length} listings</p>
        </div>
        {canCreate && (
          <Button leftIcon={<PlusCircle className="w-4 h-4" />} onClick={openCreate}>
            New Auction
          </Button>
        )}
      </div>

      <Card padded={false}>
        <div className="p-4 border-b border-surface-800">
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as AuctionStatus | '')
            }}
            className="w-48"
          >
            <option value="">All statuses</option>
            {(
              [
                'Draft',
                'Scheduled',
                'Active',
                'Extended',
                'Ended',
                'Awarded',
                'NoSale',
                'Cancelled',
              ] as AuctionStatus[]
            ).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>

        {auctions.length === 0 && !isLoading ? (
          <EmptyState
            icon={Gavel}
            title="No auctions found"
            description={
              statusFilter
                ? `No ${statusFilter} auctions.`
                : 'Create your first auction to get started.'
            }
            action={
              canCreate ? (
                <Button leftIcon={<PlusCircle className="w-4 h-4" />} onClick={openCreate}>
                  New Auction
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table columns={columns} data={auctions} rowKey={(a) => a.id} isLoading={isLoading} />
        )}
      </Card>
    </div>
  )
}
