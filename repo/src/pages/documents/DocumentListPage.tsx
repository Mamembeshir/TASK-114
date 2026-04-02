/**
 * DocumentListPage — filterable list of all documents.
 */
import { useEffect, useState } from 'react'
import { Archive } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { usePermission } from '@/hooks/usePermission'
import { db } from '@/db'
import { Badge, Button, Card, EmptyState, Table } from '@/components/ui'
import type { ColumnDef } from '@/components/ui'
import type { Document, DocumentStatus } from '@/types'

const STATUS_VARIANTS: Record<
  DocumentStatus,
  'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
> = {
  Draft: 'default',
  InReview: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Archived: 'default',
  PendingDestruction: 'danger',
  Destroyed: 'danger',
}

interface Row {
  doc: Document
  categoryName: string
}

const ALL_STATUSES: (DocumentStatus | 'All')[] = [
  'All',
  'Draft',
  'InReview',
  'Approved',
  'Rejected',
  'Archived',
  'PendingDestruction',
]

export function DocumentListPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { openTab } = useTabStore()
  const canCreate = usePermission('viewDocuments')
  const canManage = usePermission('approveDocument')

  const [rows, setRows] = useState<Row[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'All'>('All')

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      const [docs, cats] = await Promise.all([
        db.documents.orderBy('updatedAt').reverse().toArray(),
        db.categories.toArray(),
      ])
      const catMap = new Map(cats.map((c) => [c.id, c.name]))
      setRows(docs.map((doc) => ({ doc, categoryName: catMap.get(doc.categoryId) ?? '—' })))
      setIsLoading(false)
    }
    void load()
  }, [])

  if (!currentUser) return null

  const filtered =
    statusFilter === 'All'
      ? rows.filter((r) => r.doc.status !== 'Destroyed')
      : rows.filter((r) => r.doc.status === statusFilter)

  const columns: ColumnDef<Row>[] = [
    {
      key: 'number',
      header: 'Number',
      width: 'w-36',
      cell: (r) => (
        <span className="font-mono text-xs text-surface-400">{r.doc.documentNumber ?? '—'}</span>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      cell: (r) => (
        <button
          onClick={() => {
            openTab({
              id: `doc-detail-${r.doc.id}`,
              title: r.doc.title,
              path: `/documents/${r.doc.id}`,
            })
          }}
          className="text-primary-400 hover:underline text-left font-medium text-sm"
        >
          {r.doc.title}
        </button>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      width: 'w-28',
      cell: (r) => <span className="text-surface-400 text-sm">{r.doc.type}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-32',
      cell: (r) => <Badge variant={STATUS_VARIANTS[r.doc.status]}>{r.doc.status}</Badge>,
    },
    {
      key: 'category',
      header: 'Category',
      width: 'w-28',
      cell: (r) => <span className="text-surface-500 text-xs">{r.categoryName}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 'w-28',
      cell: (r) => (
        <div className="flex justify-end">
          {['Draft', 'Rejected'].includes(r.doc.status) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                openTab({
                  id: `doc-edit-${r.doc.id}`,
                  title: `Edit: ${r.doc.title}`,
                  path: `/documents/${r.doc.id}/edit`,
                })
              }}
            >
              Edit
            </Button>
          )}
          {r.doc.status === 'InReview' && canManage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                openTab({
                  id: `doc-review-${r.doc.id}`,
                  title: `Review: ${r.doc.title}`,
                  path: `/documents/${r.doc.id}/review`,
                })
              }}
            >
              Review
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
          <h1 className="text-lg font-semibold text-surface-100">Documents</h1>
          <p className="text-sm text-surface-500 mt-0.5">Manage official documents and archive</p>
        </div>
        {canCreate && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              openTab({ id: 'doc-new', title: 'New Document', path: '/documents/new' })
            }}
          >
            + New Document
          </Button>
        )}
      </div>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        {ALL_STATUSES.map((s) => (
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
            icon={Archive}
            title="No documents"
            description={
              statusFilter === 'All'
                ? 'Create your first document.'
                : `No ${statusFilter} documents.`
            }
          />
        ) : (
          <Table columns={columns} data={filtered} rowKey={(r) => r.doc.id} isLoading={isLoading} />
        )}
      </Card>
    </div>
  )
}
