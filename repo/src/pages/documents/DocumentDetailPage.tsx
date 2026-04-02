/**
 * DocumentDetailPage — view an approved document with watermark overlay.
 * Reviewers can approve/reject here.
 * Admins can initiate/approve destruction.
 */
import { useCallback, useEffect, useState } from 'react'
import { Lock, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { usePermission } from '@/hooks/usePermission'
import { db } from '@/db'
import {
  approveDocument,
  rejectDocument,
  requestDestruction,
  reviewerApproveDestruction,
  adminApproveDestruction,
  rejectDestruction,
  generateWatermark,
} from '@/services/documentService'
import { Badge, Button, Card, CardHeader, Modal, Spinner, Textarea } from '@/components/ui'
import type { DestructionApproval, Document, DocumentStatus } from '@/types'

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

interface Props {
  documentId: string
}

export function DocumentDetailPage({ documentId }: Props) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { openTab } = useTabStore()
  const canReview = usePermission('approveDocument')
  const canDestroy = usePermission('approveDestruction')

  const [doc, setDoc] = useState<Document | null>(null)
  const [destructionApproval, setDestructionApproval] = useState<DestructionApproval | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isActing, setIsActing] = useState(false)

  const [reviewComment, setReviewComment] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showDestroyModal, setShowDestroyModal] = useState(false)
  const [destroyReason, setDestroyReason] = useState('')

  const load = useCallback(async () => {
    const [d, approvals] = await Promise.all([
      db.documents.get(documentId),
      db.destructionApprovals
        .where('documentId')
        .equals(documentId)
        .filter((a) => a.status !== 'Rejected')
        .toArray(),
    ])
    if (d) setDoc(d)
    const sorted = approvals.sort((a, b) => b.requestedAt - a.requestedAt)
    setDestructionApproval(sorted.length > 0 ? sorted[0] : null)
    setIsLoading(false)
  }, [documentId])

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

  if (!doc) {
    return <div className="p-6 text-surface-500 text-sm">Document not found.</div>
  }

  const watermark = generateWatermark(currentUser.id, currentUser.displayName)

  const handleApprove = async () => {
    setIsActing(true)
    try {
      await approveDocument(documentId, currentUser.id, currentUser.displayName, reviewComment)
      toast.success('Document approved and numbered')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setIsActing(false)
    }
  }

  const handleReject = async () => {
    if (!reviewComment.trim()) {
      toast.error('Rejection comment is required')
      return
    }
    setIsActing(true)
    try {
      await rejectDocument(documentId, currentUser.id, currentUser.displayName, reviewComment)
      toast.success('Document rejected')
      setShowRejectModal(false)
      setReviewComment('')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject')
    } finally {
      setIsActing(false)
    }
  }

  const handleRequestDestruction = async () => {
    if (!destroyReason.trim()) {
      toast.error('Reason is required')
      return
    }
    setIsActing(true)
    try {
      await requestDestruction(documentId, destroyReason, currentUser.id, currentUser.displayName)
      toast.success('Destruction request submitted')
      setShowDestroyModal(false)
      setDestroyReason('')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to request destruction')
    } finally {
      setIsActing(false)
    }
  }

  const handleReviewerApproveDestruction = async () => {
    if (!destructionApproval) return
    setIsActing(true)
    try {
      await reviewerApproveDestruction(
        destructionApproval.id,
        currentUser.id,
        currentUser.displayName,
      )
      toast.success('Reviewer approval recorded')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setIsActing(false)
    }
  }

  const handleAdminApproveDestruction = async () => {
    if (!destructionApproval) return
    setIsActing(true)
    try {
      await adminApproveDestruction(destructionApproval.id, currentUser.id, currentUser.displayName)
      toast.success('Document destroyed')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setIsActing(false)
    }
  }

  const handleRejectDestruction = async () => {
    if (!destructionApproval || !destroyReason.trim()) return
    setIsActing(true)
    try {
      await rejectDestruction(
        destructionApproval.id,
        destroyReason,
        currentUser.id,
        currentUser.displayName,
      )
      toast.success('Destruction rejected')
      setShowDestroyModal(false)
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setIsActing(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          {doc.documentNumber && (
            <p className="font-mono text-xs text-surface-500 mb-1">{doc.documentNumber}</p>
          )}
          <h1 className="text-xl font-bold text-surface-50 leading-tight">{doc.title}</h1>
          <p className="text-surface-500 text-sm mt-1">{doc.type}</p>
        </div>
        <div className="flex items-center gap-2">
          {doc.checkedOutBy && (
            <div className="flex items-center gap-1 text-amber-400 text-xs">
              <Lock className="w-3.5 h-3.5" />
              <span>Checked out</span>
            </div>
          )}
          <Badge variant={STATUS_VARIANTS[doc.status]}>{doc.status}</Badge>
        </div>
      </div>

      {/* Edit link for Draft/Rejected */}
      {['Draft', 'Rejected'].includes(doc.status) && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              openTab({
                id: `doc-edit-${doc.id}`,
                title: `Edit: ${doc.title}`,
                path: `/documents/${doc.id}/edit`,
              })
            }}
          >
            Open Editor
          </Button>
        </div>
      )}

      {/* Content with watermark */}
      <Card>
        <CardHeader title="Content" />
        <div className="relative">
          <div
            className="prose prose-invert prose-sm max-w-none text-surface-300"
            dangerouslySetInnerHTML={{ __html: doc.body }}
          />
          {/* Watermark overlay */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
            style={{ transform: 'rotate(-30deg)' }}
          >
            <span className="text-surface-700/40 text-sm font-mono whitespace-nowrap">
              {watermark}
            </span>
          </div>
        </div>
        {doc.attachmentUrls.filter(Boolean).length > 0 && (
          <div className="mt-4 pt-4 border-t border-surface-800">
            <p className="text-xs font-medium text-surface-500 mb-2">Attachments</p>
            <div className="space-y-1">
              {doc.attachmentUrls.filter(Boolean).map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-primary-400 hover:underline truncate"
                >
                  {url}
                </a>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Review actions */}
      {canReview && doc.status === 'InReview' && (
        <Card>
          <CardHeader title="Review Decision" />
          <div className="space-y-3">
            <Textarea
              label="Comment (optional for approval, required for rejection)"
              value={reviewComment}
              onChange={(e) => {
                setReviewComment(e.target.value)
              }}
              rows={3}
              placeholder="Add a review comment…"
            />
            <div className="flex gap-3">
              <Button variant="primary" onClick={() => void handleApprove()} isLoading={isActing}>
                Approve & Assign Number
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

      {/* Destruction workflow */}
      {doc.status === 'Approved' && canDestroy && !destructionApproval && (
        <Card>
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-surface-200">Request Document Destruction</p>
              <p className="text-xs text-surface-500 mt-0.5">
                This initiates the two-step destruction approval process.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setShowDestroyModal(true)
              }}
            >
              Request Destruction
            </Button>
          </div>
        </Card>
      )}

      {/* Destruction pending actions */}
      {destructionApproval && doc.status === 'PendingDestruction' && (
        <Card>
          <CardHeader title="Destruction Approval" />
          <div className="space-y-3 text-sm">
            <div className="bg-surface-800/50 rounded-lg p-3 text-surface-300">
              <p className="font-medium text-surface-200 mb-1">Reason for destruction:</p>
              <p>{destructionApproval.reason}</p>
            </div>
            <div className="flex items-center gap-4">
              <div
                className={`flex items-center gap-1.5 text-xs ${destructionApproval.reviewerApprovedBy ? 'text-emerald-400' : 'text-surface-500'}`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${destructionApproval.reviewerApprovedBy ? 'bg-emerald-400' : 'bg-surface-600'}`}
                />
                Step 1: Reviewer approved
              </div>
              <div
                className={`flex items-center gap-1.5 text-xs ${destructionApproval.adminApprovedBy ? 'text-emerald-400' : 'text-surface-500'}`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${destructionApproval.adminApprovedBy ? 'bg-emerald-400' : 'bg-surface-600'}`}
                />
                Step 2: Admin approved
              </div>
            </div>
            {canReview && destructionApproval.status === 'Pending' && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => void handleReviewerApproveDestruction()}
                isLoading={isActing}
              >
                Reviewer — Approve Destruction
              </Button>
            )}
            {canDestroy && destructionApproval.status === 'ReviewerApproved' && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => void handleAdminApproveDestruction()}
                isLoading={isActing}
              >
                Admin — Confirm Destruction
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Reject modal */}
      <Modal
        open={showRejectModal}
        onClose={() => {
          setShowRejectModal(false)
        }}
        title="Reject Document"
      >
        <div className="space-y-4">
          <Textarea
            label="Rejection reason (required)"
            value={reviewComment}
            onChange={(e) => {
              setReviewComment(e.target.value)
            }}
            rows={4}
            placeholder="Explain why this document is being rejected…"
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
              disabled={!reviewComment.trim()}
            >
              Reject
            </Button>
          </div>
        </div>
      </Modal>

      {/* Destruction request / reject modal */}
      <Modal
        open={showDestroyModal}
        onClose={() => {
          setShowDestroyModal(false)
        }}
        title={destructionApproval ? 'Reject Destruction' : 'Request Destruction'}
      >
        <div className="space-y-4">
          <Textarea
            label={destructionApproval ? 'Rejection reason' : 'Reason for destruction (required)'}
            value={destroyReason}
            onChange={(e) => {
              setDestroyReason(e.target.value)
            }}
            rows={4}
            placeholder="Provide a mandatory reason…"
          />
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDestroyModal(false)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                destructionApproval
                  ? void handleRejectDestruction()
                  : void handleRequestDestruction()
              }
              isLoading={isActing}
              disabled={!destroyReason.trim()}
            >
              {destructionApproval ? 'Reject Request' : 'Submit Request'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
