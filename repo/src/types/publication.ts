// ── Publishing Workbench ──────────────────────────────────────────────────────

export type PublicationType = 'Announcement' | 'Notice' | 'Bulletin'

export type WorkflowStatus = 'Draft' | 'InReview' | 'Approved' | 'Rejected' | 'Published'

export interface Publication {
  id: string
  title: string
  type: PublicationType
  body: string
  attachmentUrls: string[]
  status: WorkflowStatus
  /** Words flagged by moderation (must be empty before publish) */
  moderationFlags: string[]
  /** Points to the active PublicationVersion snapshot */
  currentVersionId: string
  publishedAt?: number
  createdBy: string
  createdAt: number
  updatedAt: number
}

export interface PublicationVersion {
  id: string
  publicationId: string
  /** Monotonically increasing — starts at 1 */
  versionNumber: number
  title: string
  body: string
  status: WorkflowStatus
  reviewComment?: string
  reviewedBy?: string
  reviewedAt?: number
  createdBy: string
  createdAt: number
}

export interface ViewEvent {
  id: string
  /** Shared by publications and documents */
  entityType: 'Publication' | 'Document'
  entityId: string
  userId: string
  sessionId: string
  openedAt: number
  closedAt?: number
  /** Calculated from closedAt - openedAt on close */
  durationSeconds?: number
}
