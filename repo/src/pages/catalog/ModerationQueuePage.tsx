/**
 * ModerationQueuePage — shows all catalog items with unresolved moderation flags.
 * Reviewers can approve or reject each flagged item from here.
 * Visible to Reviewers and Administrators.
 */
import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { db } from '@/db'
import { approveModerationFlags, rejectModerationFlags } from '@/services/catalogService'
import { Badge, Button, Card, EmptyState, Table } from '@/components/ui'
import type { ColumnDef } from '@/components/ui'
import type { CatalogItem, CatalogItemStatus, ModerationStatus } from '@/types'

const STATUS_VARIANTS: Record<CatalogItemStatus, 'default' | 'success' | 'danger' | 'warning'> = {
  Draft: 'warning',
  Active: 'success',
  Archived: 'default',
}

const MODERATION_VARIANTS: Record<
  ModerationStatus,
  'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
> = {
  Pending: 'warning',
  ReviewerApproved: 'success',
  ReviewerRejected: 'danger',
}

interface Row {
  item: CatalogItem
  categoryName: string
}

export function ModerationQueuePage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { openTab } = useTabStore()
  const [rows, setRows] = useState<Row[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  const load = async () => {
    setIsLoading(true)
    const [items, cats] = await Promise.all([db.catalogItems.toArray(), db.categories.toArray()])
    const catMap = new Map(cats.map((c) => [c.id, c.name]))
    const flagged = items
      .filter((item) => item.moderationFlags.length > 0 && item.status !== 'Archived')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((item) => ({ item, categoryName: catMap.get(item.categoryId) ?? '—' }))
    setRows(flagged)
    setIsLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  if (!currentUser) return null

  const handleApprove = async (id: string) => {
    setActing(id)
    try {
      await approveModerationFlags(id, currentUser.id, currentUser.displayName)
      toast.success('Flags approved — item may now be published')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setActing(null)
    }
  }

  const handleReject = async (id: string) => {
    setActing(id)
    try {
      await rejectModerationFlags(id, currentUser.id, currentUser.displayName)
      toast.success('Item rejected — editor must revise content')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject')
    } finally {
      setActing(null)
    }
  }

  const columns: ColumnDef<Row>[] = [
    {
      key: 'title',
      header: 'Title',
      cell: (r) => (
        <button
          onClick={() => {
            openTab({
              id: `catalog-edit-${r.item.id}`,
              title: `Edit: ${r.item.title}`,
              path: `/catalog/${r.item.id}/edit`,
            })
          }}
          className="text-primary-400 hover:underline text-left font-medium text-sm"
        >
          {r.item.title}
        </button>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-24',
      cell: (r) => <Badge variant={STATUS_VARIANTS[r.item.status]}>{r.item.status}</Badge>,
    },
    {
      key: 'moderation',
      header: 'Review',
      width: 'w-36',
      cell: (r) => (
        <Badge variant={MODERATION_VARIANTS[r.item.moderationStatus]}>
          {r.item.moderationStatus}
        </Badge>
      ),
    },
    {
      key: 'flags',
      header: 'Flagged Words',
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.item.moderationFlags.map((word) => (
            <span
              key={word}
              className="px-2 py-0.5 rounded text-xs font-mono bg-red-500/10 text-red-400 border border-red-500/20"
            >
              {word}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: 'w-32',
      cell: (r) => <span className="text-surface-400 text-sm">{r.categoryName}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 'w-44',
      cell: (r) => (
        <div className="flex items-center gap-1 justify-end">
          {r.item.moderationStatus !== 'ReviewerApproved' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleApprove(r.item.id)}
              isLoading={acting === r.item.id}
              disabled={acting !== null}
            >
              Approve
            </Button>
          )}
          {r.item.moderationStatus !== 'ReviewerRejected' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleReject(r.item.id)}
              isLoading={acting === r.item.id}
              disabled={acting !== null}
            >
              Reject
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">Moderation Queue</h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Catalog items with content flags — approve to unblock publishing or reject to require edits
        </p>
      </div>

      <Card padded={false}>
        {rows.length === 0 && !isLoading ? (
          <EmptyState
            icon={ShieldAlert}
            title="No items flagged"
            description="All catalog items have passed content moderation."
          />
        ) : (
          <Table columns={columns} data={rows} rowKey={(r) => r.item.id} isLoading={isLoading} />
        )}
      </Card>
    </div>
  )
}
