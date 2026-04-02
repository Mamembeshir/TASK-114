/**
 * ReviewQueuePage — lists all publications in InReview status for Reviewer/Approver.
 */
import { useEffect, useState } from 'react'
import { CheckSquare } from 'lucide-react'
import { useTabStore } from '@/store/tabStore'
import { db } from '@/db'
import { Badge, Card, EmptyState, Table } from '@/components/ui'
import type { ColumnDef } from '@/components/ui'
import type { Publication, PublicationType, WorkflowStatus } from '@/types'

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

const TYPE_LABELS: Record<PublicationType, string> = {
  Announcement: 'Announcement',
  Notice: 'Notice',
  Bulletin: 'Bulletin',
}

export function ReviewQueuePage() {
  const { openTab } = useTabStore()
  const [publications, setPublications] = useState<Publication[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const pubs = await db.publications
        .where('status')
        .equals('InReview')
        .reverse()
        .sortBy('updatedAt')
      setPublications(pubs)
      setIsLoading(false)
    }
    void load()
  }, [])

  const columns: ColumnDef<Publication>[] = [
    {
      key: 'title',
      header: 'Title',
      cell: (pub) => (
        <button
          onClick={() => {
            openTab({
              id: `pub-review-${pub.id}`,
              title: `Review: ${pub.title}`,
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
      cell: (pub) => <span className="text-surface-400 text-sm">{TYPE_LABELS[pub.type]}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-28',
      cell: (pub) => <Badge variant={STATUS_VARIANTS[pub.status]}>{pub.status}</Badge>,
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      width: 'w-40',
      cell: (pub) => (
        <span className="text-surface-500 text-xs">{new Date(pub.updatedAt).toLocaleString()}</span>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">Review Queue</h1>
        <p className="text-sm text-surface-500 mt-0.5">Publications awaiting your review</p>
      </div>

      <Card padded={false}>
        {publications.length === 0 && !isLoading ? (
          <EmptyState
            icon={CheckSquare}
            title="Queue is clear"
            description="No publications are awaiting review."
          />
        ) : (
          <Table
            columns={columns}
            data={publications}
            rowKey={(pub) => pub.id}
            isLoading={isLoading}
          />
        )}
      </Card>
    </div>
  )
}
