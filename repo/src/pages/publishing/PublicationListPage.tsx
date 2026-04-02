/**
 * PublicationListPage — editor/admin management view for all publications.
 */
import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { usePermission } from '@/hooks/usePermission'
import { db } from '@/db'
import { publishPublication } from '@/services/publicationService'
import { Badge, Button, Card, EmptyState, Table } from '@/components/ui'
import type { ColumnDef } from '@/components/ui'
import type { Publication, WorkflowStatus } from '@/types'

const STATUS_VARIANTS: Record<
  WorkflowStatus,
  'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
> = {
  Draft: 'default',
  InReview: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Published: 'primary',
}

export function PublicationListPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { openTab } = useTabStore()
  const canCreate = usePermission('createCatalogItem') // ContentEditor / Admin
  const canReview = usePermission('approvePublication')

  const [publications, setPublications] = useState<Publication[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | 'All'>('All')

  const load = async () => {
    setIsLoading(true)
    try {
      const pubs = await db.publications.orderBy('updatedAt').reverse().toArray()
      setPublications(pubs)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (!currentUser) return null

  const filtered =
    statusFilter === 'All' ? publications : publications.filter((p) => p.status === statusFilter)

  const handlePublish = async (id: string) => {
    try {
      await publishPublication(id, currentUser.id, currentUser.displayName)
      toast.success('Published!')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish')
    }
  }

  const columns: ColumnDef<Publication>[] = [
    {
      key: 'title',
      header: 'Title',
      cell: (pub) => (
        <button
          onClick={() => {
            openTab({
              id: `pub-review-${pub.id}`,
              title: pub.title,
              path: `/publishing/${pub.id}/review`,
            })
          }}
          className="text-primary-400 hover:underline text-left font-medium text-sm"
        >
          {pub.title}
        </button>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      width: 'w-32',
      cell: (pub) => <span className="text-surface-400 text-sm">{pub.type}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-28',
      cell: (pub) => <Badge variant={STATUS_VARIANTS[pub.status]}>{pub.status}</Badge>,
    },
    {
      key: 'updated',
      header: 'Updated',
      width: 'w-40',
      cell: (pub) => (
        <span className="text-surface-500 text-xs">{new Date(pub.updatedAt).toLocaleString()}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-48',
      cell: (pub) => (
        <div className="flex items-center gap-1 justify-end">
          {(pub.status === 'Draft' || pub.status === 'Rejected') && canCreate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                openTab({
                  id: `pub-edit-${pub.id}`,
                  title: `Edit: ${pub.title}`,
                  path: `/publishing/${pub.id}/edit`,
                })
              }}
            >
              Edit
            </Button>
          )}
          {pub.status === 'InReview' && canReview && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                openTab({
                  id: `pub-review-${pub.id}`,
                  title: `Review: ${pub.title}`,
                  path: `/publishing/${pub.id}/review`,
                })
              }}
            >
              Review
            </Button>
          )}
          {pub.status === 'Approved' && canCreate && (
            <Button variant="ghost" size="sm" onClick={() => void handlePublish(pub.id)}>
              Publish
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
          <h1 className="text-lg font-semibold text-surface-100">Publishing</h1>
          <p className="text-sm text-surface-500 mt-0.5">Manage publications and announcements</p>
        </div>
        {canCreate && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              openTab({ id: 'pub-new', title: 'New Publication', path: '/publishing/new' })
            }}
          >
            + New Publication
          </Button>
        )}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {(['All', 'Draft', 'InReview', 'Approved', 'Rejected', 'Published'] as const).map((s) => (
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
            icon={FileText}
            title="No publications"
            description={
              statusFilter === 'All'
                ? 'Create your first publication.'
                : `No ${statusFilter} publications.`
            }
          />
        ) : (
          <Table columns={columns} data={filtered} rowKey={(pub) => pub.id} isLoading={isLoading} />
        )}
      </Card>
    </div>
  )
}
