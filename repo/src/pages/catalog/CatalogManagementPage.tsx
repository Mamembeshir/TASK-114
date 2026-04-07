/**
 * CatalogManagementPage — admin/editor view for managing catalog items.
 */
import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { usePermission } from '@/hooks/usePermission'
import { db } from '@/db'
import {
  publishCatalogItem,
  archiveCatalogItem,
  restoreCatalogItem,
} from '@/services/catalogService'
import { Badge, Button, Card, EmptyState, Table } from '@/components/ui'
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

export function CatalogManagementPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { openTab } = useTabStore()
  const canCreate = usePermission('createCatalogItem')
  const canManage = usePermission('manageCatalog')

  const [rows, setRows] = useState<Row[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<CatalogItemStatus | 'All'>('All')

  const load = async () => {
    setIsLoading(true)
    try {
      const [items, cats] = await Promise.all([
        db.catalogItems.orderBy('createdAt').reverse().toArray(),
        db.categories.toArray(),
      ])
      const catMap = new Map(cats.map((c) => [c.id, c.name]))
      setRows(
        items.map((item) => ({
          item,
          categoryName: catMap.get(item.categoryId) ?? '—',
        })),
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (!currentUser) return null

  const filtered =
    statusFilter === 'All' ? rows : rows.filter((r) => r.item.status === statusFilter)

  const handlePublish = async (id: string) => {
    try {
      await publishCatalogItem(id, currentUser.id, currentUser.displayName)
      toast.success('Item published')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish')
    }
  }

  const handleArchive = async (id: string) => {
    try {
      await archiveCatalogItem(id, currentUser.id, currentUser.displayName)
      toast.success('Item archived')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive')
    }
  }

  const handleRestore = async (id: string) => {
    try {
      await restoreCatalogItem(id, currentUser.id, currentUser.displayName)
      toast.success('Item restored to Draft')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore')
    }
  }

  const columns: ColumnDef<Row>[] = [
    {
      key: 'title',
      header: 'Title',
      cell: (r) => <span className="font-medium text-surface-100 text-sm">{r.item.title}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      width: 'w-32',
      cell: (r) => <span className="text-surface-400 text-sm">{r.categoryName}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-24',
      cell: (r) => <Badge variant={STATUS_VARIANTS[r.item.status]}>{r.item.status}</Badge>,
    },
    {
      key: 'price',
      header: 'Price',
      width: 'w-24',
      cell: (r) => <span className="font-mono text-surface-300 text-sm">{r.item.price}</span>,
    },
    {
      key: 'stock',
      header: 'Stock',
      width: 'w-20',
      cell: (r) => <span className="font-mono text-surface-400 text-sm">{r.item.stock}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 'w-48',
      cell: (r) => (
        <div className="flex items-center gap-1 justify-end">
          {r.item.status !== 'Archived' && canCreate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                openTab({
                  id: `catalog-edit-${r.item.id}`,
                  title: `Edit: ${r.item.title}`,
                  path: `/catalog/${r.item.id}/edit`,
                })
              }}
            >
              Edit
            </Button>
          )}
          {r.item.status === 'Draft' &&
            canCreate &&
            r.item.moderationStatus !== 'ReviewerRejected' &&
            (r.item.moderationFlags.length === 0 ||
              r.item.moderationStatus === 'ReviewerApproved') && (
              <Button variant="ghost" size="sm" onClick={() => void handlePublish(r.item.id)}>
                Publish
              </Button>
            )}
          {r.item.status === 'Draft' && r.item.moderationStatus === 'ReviewerRejected' && (
            <span className="text-xs text-danger-400 px-1">Rejected</span>
          )}
          {r.item.status === 'Draft' &&
            r.item.moderationFlags.length > 0 &&
            r.item.moderationStatus === 'Pending' && (
              <span className="text-xs text-warning-400 px-1">Awaiting review</span>
            )}
          {r.item.status === 'Active' && canManage && (
            <Button variant="ghost" size="sm" onClick={() => void handleArchive(r.item.id)}>
              Archive
            </Button>
          )}
          {r.item.status === 'Archived' && canManage && (
            <Button variant="ghost" size="sm" onClick={() => void handleRestore(r.item.id)}>
              Restore
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
          <h1 className="text-lg font-semibold text-surface-100">Catalog</h1>
          <p className="text-sm text-surface-500 mt-0.5">Manage catalog items</p>
        </div>
        {canCreate && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              openTab({ id: 'catalog-new', title: 'New Item', path: '/catalog/new' })
            }}
          >
            + New Item
          </Button>
        )}
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {(['All', 'Draft', 'Active', 'Archived'] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s)
            }}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              statusFilter === s
                ? 'bg-primary-600 text-white'
                : 'bg-surface-800 text-surface-400 hover:bg-surface-700',
            ].join(' ')}
          >
            {s}
          </button>
        ))}
      </div>

      <Card padded={false}>
        {filtered.length === 0 && !isLoading ? (
          <EmptyState
            icon={Package}
            title="No items"
            description={
              statusFilter === 'All'
                ? 'Create your first catalog item.'
                : `No ${statusFilter} items.`
            }
          />
        ) : (
          <Table
            columns={columns}
            data={filtered}
            rowKey={(r) => r.item.id}
            isLoading={isLoading}
          />
        )}
      </Card>
    </div>
  )
}
