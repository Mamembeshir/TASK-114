// ── Catalog & Search ──────────────────────────────────────────────────────────

export type CatalogItemStatus = 'Draft' | 'Active' | 'Archived'

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
