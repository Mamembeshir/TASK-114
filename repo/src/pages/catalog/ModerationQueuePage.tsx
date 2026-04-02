/**
 * ModerationQueuePage — shows all catalog items with unresolved moderation flags.
 * Visible to Reviewers and Administrators.
 */
import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useTabStore } from '@/store/tabStore'
import { db } from '@/db'
import { Badge, Card, EmptyState, Table } from '@/components/ui'
import type { ColumnDef } from '@/components/ui'
import type { CatalogItem, CatalogItemStatus } from '@/types'

const STATUS_VARIANTS: Record<CatalogItemStatus, 'default' | 'success' | 'danger' | 'warning'> = {
  Draft: 'warning',
  Active: 'success',
  Archived: 'default',
}

interface Row {
  item: CatalogItem
  categoryName: string
}

export function ModerationQueuePage() {
  const { openTab } = useTabStore()
  const [rows, setRows] = useState<Row[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const [items, cats] = await Promise.all([db.catalogItems.toArray(), db.categories.toArray()])
      const catMap = new Map(cats.map((c) => [c.id, c.name]))
      const flagged = items
        .filter((item) => item.moderationFlags.length > 0 && item.status !== 'Archived')
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((item) => ({ item, categoryName: catMap.get(item.categoryId) ?? '—' }))
      setRows(flagged)
      setIsLoading(false)
    }
    void load()
  }, [])

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
      key: 'updated',
      header: 'Last Updated',
      width: 'w-36',
      cell: (r) => (
        <span className="text-surface-500 text-xs">
          {new Date(r.item.updatedAt).toLocaleString()}
        </span>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">Moderation Queue</h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Catalog items with unresolved content flags
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
