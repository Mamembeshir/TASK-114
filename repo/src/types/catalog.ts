// ── Catalog & Search ──────────────────────────────────────────────────────────

export type CatalogItemStatus = 'Draft' | 'Active' | 'Archived'

/**
 * Reviewer disposition for flagged content.
 * - Pending: flags present, awaiting reviewer decision (also the state when no
 *   flags exist and no review has been done — publish is permitted flag-free).
 * - ReviewerApproved: reviewer explicitly cleared the flags; publishing allowed
 *   even while flag list is non-empty.
 * - ReviewerRejected: reviewer blocked this item; must be edited to clear flags
 *   before a new review cycle can proceed.
 */
export type ModerationStatus = 'Pending' | 'ReviewerApproved' | 'ReviewerRejected'

export interface CatalogItem {
  id: string
  title: string
  description: string
  /** Optional brand / manufacturer name */
  brand?: string
  categoryId: string
  /** Multi-entry indexed for fast tag filtering */
  tags: string[]
  price: number
  stock: number
  imageUrls: string[]
  status: CatalogItemStatus
  /** Words flagged by the moderation engine */
  moderationFlags: string[]
  /** Reviewer disposition for flagged content — see ModerationStatus */
  moderationStatus: ModerationStatus
  /** Number of times this item has been sold (updated by auction/order service) */
  salesCount: number
  /** Cumulative rating score (sum of all ratings) — divide by ratingCount for average */
  ratingScore: number
  /** Number of ratings submitted */
  ratingCount: number
  createdBy: string
  createdAt: number
  updatedAt: number
}

export interface Category {
  id: string
  name: string
  /** Supports nested categories */
  parentId?: string
  createdAt: number
}

export interface Tag {
  id: string
  name: string
  createdAt: number
}

// ── Catalog Reviews ────────────────────────────────────────────────────────────

export type CatalogReviewStatus = 'Approved' | 'Flagged' | 'Removed'

export interface CatalogReview {
  id: string
  itemId: string
  userId: string
  /** Denormalized display name — preserved if user is deactivated */
  username: string
  /** Integer 1–5 */
  rating: number
  comment: string
  /** Words flagged by the moderation engine on the comment */
  moderationFlags: string[]
  status: CatalogReviewStatus
  createdAt: number
  updatedAt: number
}
