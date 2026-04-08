/**
 * DocumentListPage — filterable list of all documents.
 */
import { useEffect, useMemo, useState } from 'react'
import { Archive, Search } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { usePermission } from '@/hooks/usePermission'
import { db } from '@/db'
import { listDocuments } from '@/services/documentService'
import { Badge, Button, Card, EmptyState, Table } from '@/components/ui'
import type { ColumnDef } from '@/components/ui'
import type { Category, Document, DocumentStatus } from '@/types'

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

const DOCUMENT_TYPES = ['Policy', 'Procedure', 'Form', 'Manual', 'Report', 'Other']

export function DocumentListPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { openTab } = useTabStore()
  const canCreate = usePermission('createDocument')
  const canManage = usePermission('approveDocument')

  const [rows, setRows] = useState<Row[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filter state
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'All'>('All')
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      const [docs, cats] = await Promise.all([listDocuments(), db.categories.toArray()])
      const catMap = new Map(cats.map((c) => [c.id, c.name]))
      setRows(docs.map((doc) => ({ doc, categoryName: catMap.get(doc.categoryId) ?? '—' })))
      setCategories(cats)
      setIsLoading(false)
    }
    void load()
  }, [])

  if (!currentUser) return null

  // Multidimensional in-memory filter (uses indexed results from listDocuments)
  const filtered = useMemo(() => {
    let result = rows.filter((r) => r.doc.status !== 'Destroyed')

    if (statusFilter !== 'All') {
      result = result.filter((r) => r.doc.status === statusFilter)
    }
    if (typeFilter) {
      result = result.filter((r) => r.doc.type === typeFilter)
    }
    if (categoryFilter) {
      result = result.filter((r) => r.doc.categoryId === categoryFilter)
    }
    if (tagFilter.trim()) {
      const t = tagFilter.trim().toLowerCase()
      result = result.filter((r) => (r.doc.tags ?? []).some((tag) => tag.toLowerCase().includes(t)))
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      result = result.filter(
        (r) =>
          r.doc.title.toLowerCase().includes(q) ||
          (r.doc.documentNumber ?? '').toLowerCase().includes(q) ||
          (r.doc.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
      )
    }
    return result
  }, [rows, statusFilter, typeFilter, categoryFilter, tagFilter, query])

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
      key: 'tags',
      header: 'Tags',
      width: 'w-40',
      cell: (r) =>
        r.doc.tags && r.doc.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {r.doc.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs bg-surface-700 text-surface-400 rounded px-1.5 py-0.5"
              >
                {tag}
              </span>
            ))}
            {r.doc.tags.length > 3 && (
              <span className="text-xs text-surface-600">+{r.doc.tags.length - 3}</span>
            )}
          </div>
        ) : (
          <span className="text-surface-700 text-xs">—</span>
        ),
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

      {/* Multidimensional search & filter bar */}
      <div className="space-y-2">
        {/* Free-text search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500 pointer-events-none" />
          <input
            className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-9 pr-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500"
            placeholder="Search by title, document number, or tag…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
            }}
          />
        </div>

        {/* Dimension filters */}
        <div className="flex gap-2 flex-wrap items-center">
          {/* Status pills */}
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

          {/* Type dropdown */}
          <select
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-xs text-surface-300 focus:outline-none focus:border-primary-500"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value)
            }}
          >
            <option value="">All types</option>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Category dropdown */}
          <select
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-xs text-surface-300 focus:outline-none focus:border-primary-500"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value)
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Tag filter */}
          <input
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-xs text-surface-300 placeholder-surface-600 focus:outline-none focus:border-primary-500"
            placeholder="Filter by tag…"
            value={tagFilter}
            onChange={(e) => {
              setTagFilter(e.target.value)
            }}
          />
        </div>
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
