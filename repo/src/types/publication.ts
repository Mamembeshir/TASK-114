// ── Publishing Workbench ──────────────────────────────────────────────────────

import type { Role } from '@/types/auth'

export type PublicationType = 'Announcement' | 'Notice' | 'Bulletin' | 'Carousel'

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
  /**
   * Roles that may see this publication in the feed.
   * Empty array = visible to all roles (global broadcast).
   */
  audienceRoles: Role[]
  /**
   * Organisations that may see this publication.
   * Empty array = visible to all organisations (global broadcast).
   */
  audienceOrgs: string[]
  /**
   * Topic tags used for self-serve feed filtering by readers.
   * Also used to scope publications to tagged audiences.
   */
  audienceTags: string[]
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
