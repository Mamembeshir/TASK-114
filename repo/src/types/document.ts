// ── Document & Archive ────────────────────────────────────────────────────────

export type DocumentStatus =
  | 'Draft'
  | 'InReview'
  | 'Approved'
  | 'Rejected'
  | 'Archived'
  | 'PendingDestruction'
  | 'Destroyed'

export type DestructionApprovalStatus =
  | 'Pending'
  | 'ReviewerApproved' // step 1 of 2
  | 'FullyApproved' // both Reviewer + Admin approved
  | 'Rejected'

export interface Document {
  id: string
  /**
   * Assigned only on Draft → Approved transition.
   * Format: `{PREFIX}-{YYYY}-{NNNNNN}` e.g. ORG-2026-000001
   * Per decision #6: undefined until approved to avoid numbering gaps.
   */
  documentNumber?: string
  title: string
  /** e.g. 'Policy' | 'Procedure' | 'Form' | 'Manual' */
  type: string
  categoryId: string
  body: string
  attachmentUrls: string[]
  status: DocumentStatus
  currentVersionId?: string
  /** userId who currently holds the exclusive checkout lock */
  checkedOutBy?: string
  checkedOutAt?: number
  /** Auto-release checkout after this timestamp if user does not check in */
  checkoutExpiresAt?: number
  /** Retention period in years (copied from RetentionPolicy at creation time) */
  retentionYears: number
  /** Epoch ms — set when document reaches Approved status */
  retentionDueDate?: number
  moderationFlags: string[]
  /** Multi-entry indexed tags for search and classification */
  tags: string[]
  /** Arbitrary key-value metadata (e.g. owner, department, classification) */
  metadata: Record<string, string>
  /** Template this document was created from, if any */
  templateId?: string
  createdBy: string
  createdAt: number
  updatedAt: number
}

/**
 * Reusable document template — pre-fills type, body, tags, and retention
 * when creating a new document.
 */
export interface DocumentTemplate {
  id: string
  name: string
  /** Default document type for documents created from this template */
  type: string
  categoryId: string
  body: string
  defaultRetentionYears: number
  /** Default tags applied to documents created from this template */
  tags: string[]
  createdBy: string
  createdAt: number
  updatedAt: number
}

export interface DocumentVersion {
  id: string
  documentId: string
  versionNumber: number
  title: string
  body: string
  status: DocumentStatus
  reviewComment?: string
  reviewedBy?: string
  reviewedAt?: number
  /** Watermark string embedded on view/export e.g. "CONFIDENTIAL · john · 2026-01-01" */
  watermark: string
  createdBy: string
  createdAt: number
}

export interface CheckoutRecord {
  id: string
  documentId: string
  userId: string
  checkedOutAt: number
  checkedInAt?: number
  /** False once checked in or auto-released */
  isActive: boolean
}

export interface RetentionPolicy {
  id: string
  categoryId: string
  retentionYears: number
  createdBy: string
  createdAt: number
  updatedAt: number
}

/**
 * Two-step destruction approval per decision #7:
 * Reviewer submits request → Administrator confirms.
 */
export interface DestructionApproval {
  id: string
  documentId: string
  requestedBy: string
  requestedAt: number
  reason: string
  status: DestructionApprovalStatus
  reviewerApprovedBy?: string
  reviewerApprovedAt?: number
  adminApprovedBy?: string
  adminApprovedAt?: number
  rejectedBy?: string
  rejectedAt?: number
  rejectionReason?: string
}
