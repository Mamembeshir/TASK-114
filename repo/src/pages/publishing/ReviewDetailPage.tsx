/**
 * ReviewDetailPage — shows a publication's content and allows Reviewers to approve or reject.
 * Also shows version history and allows rollback (5.4).
 */
import { useCallback, useEffect, useState } from 'react'
import { Clock, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { usePermission } from '@/hooks/usePermission'
import { db } from '@/db'
import {
  approvePublication,
  rejectPublication,
  publishPublication,
  rollbackToVersion,
} from '@/services/publicationService'
import { Badge, Button, Card, CardHeader, Modal, Spinner, Textarea } from '@/components/ui'
import { sanitizeHtml } from '@/utils/sanitize'
import type { Publication, PublicationVersion, WorkflowStatus } from '@/types'

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

interface Props {
  publicationId: string
}

export function ReviewDetailPage({ publicationId }: Props) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { closeTab, tabs, activeTabId } = useTabStore()
  const canReview = usePermission('approvePublication')
  const canPublish = usePermission('managePublications')

  const [pub, setPub] = useState<Publication | null>(null)
  const [versions, setVersions] = useState<PublicationVersion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isActing, setIsActing] = useState(false)
  const [comment, setComment] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)

  const load = useCallback(async () => {
    const [p, v] = await Promise.all([
      db.publications.get(publicationId),
      db.publicationVersions.where('publicationId').equals(publicationId).sortBy('versionNumber'),
    ])
    if (p) setPub(p)
    setVersions(v.reverse())
    setIsLoading(false)
  }, [publicationId])

  useEffect(() => {
    void load()
  }, [load])

  if (!currentUser) return null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!pub) {
    return <div className="p-6 text-surface-500 text-sm">Publication not found.</div>
  }

  const tabId = tabs.find((t) => t.id === activeTabId)?.id

  const handleApprove = async () => {
    setIsActing(true)
    try {
      await approvePublication(publicationId, currentUser.id, currentUser.displayName, comment)
      toast.success('Publication approved')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setIsActing(false)
    }
  }

  const handleReject = async () => {
    if (!comment.trim()) {
      toast.error('A rejection comment is required')
      return
    }
    setIsActing(true)
    try {
      await rejectPublication(publicationId, currentUser.id, currentUser.displayName, comment)
      toast.success('Publication rejected')
      setShowRejectModal(false)
      setComment('')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject')
    } finally {
      setIsActing(false)
    }
  }

  const handlePublish = async () => {
    setIsActing(true)
    try {
      await publishPublication(publicationId, currentUser.id, currentUser.displayName)
      toast.success('Publication published!')
      if (tabId) closeTab(tabId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish')
    } finally {
      setIsActing(false)
    }
  }

  const handleRollback = async (versionId: string, versionNumber: number) => {
    setIsActing(true)
    try {
      await rollbackToVersion(publicationId, versionId, currentUser.id, currentUser.displayName)
      toast.success(`Rolled back to version ${String(versionNumber)}`)
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rollback')
    } finally {
      setIsActing(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-surface-50 leading-tight">{pub.title}</h1>
          <p className="text-surface-500 text-sm mt-1">{pub.type}</p>
        </div>
        <Badge variant={STATUS_VARIANTS[pub.status]}>{pub.status}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Content */}
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader title="Content" />
            <div
              className="prose prose-invert prose-sm max-w-none text-surface-300"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(pub.body) }}
            />
          </Card>

          {/* Reviewer actions */}
          {canReview && pub.status === 'InReview' && (
            <Card>
              <CardHeader title="Review Decision" />
              <div className="space-y-3">
                <Textarea
                  label="Comment (optional for approval, required for rejection)"
                  value={comment}
                  onChange={(e) => {
                    setComment(e.target.value)
                  }}
                  rows={3}
                  placeholder="Add a review comment…"
                />
                <div className="flex gap-3">
                  <Button
                    variant="primary"
                    onClick={() => void handleApprove()}
                    isLoading={isActing}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setShowRejectModal(true)
                    }}
                    isLoading={isActing}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Publish action (for approved publications) */}
          {pub.status === 'Approved' && canPublish && (
            <Card>
              <div className="flex items-center justify-between">
                <p className="text-sm text-surface-300">
                  This publication has been approved and is ready to publish.
                </p>
                <Button variant="primary" onClick={() => void handlePublish()} isLoading={isActing}>
                  Publish
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Version history */}
        <div>
          <Card>
            <CardHeader title="Version History" />
            {versions.length === 0 ? (
              <p className="text-xs text-surface-600">No versions yet.</p>
            ) : (
              <div className="space-y-2">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className={[
                      'p-2.5 rounded-lg border text-xs',
                      v.id === pub.currentVersionId
                        ? 'border-primary-600/30 bg-primary-600/5'
                        : 'border-surface-800 bg-surface-900/50',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-surface-200">v{v.versionNumber}</span>
                      <Badge variant={STATUS_VARIANTS[v.status]}>{v.status}</Badge>
                    </div>
                    {v.reviewComment && (
                      <p className="text-surface-500 mt-1 italic">{v.reviewComment}</p>
                    )}
                    <div className="flex items-center gap-1 text-surface-600 mt-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(v.createdAt).toLocaleString()}</span>
                    </div>
                    {pub.status !== 'Published' && v.id !== pub.currentVersionId && (
                      <button
                        onClick={() => void handleRollback(v.id, v.versionNumber)}
                        className="flex items-center gap-1 text-primary-400 hover:text-primary-300 mt-1.5 text-xs"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Rollback
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Reject modal */}
      <Modal
        open={showRejectModal}
        onClose={() => {
          setShowRejectModal(false)
        }}
        title="Reject Publication"
      >
        <div className="space-y-4">
          <Textarea
            label="Rejection reason (required)"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value)
            }}
            rows={4}
            placeholder="Explain why this publication is being rejected…"
          />
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowRejectModal(false)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleReject()}
              isLoading={isActing}
              disabled={!comment.trim()}
            >
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
