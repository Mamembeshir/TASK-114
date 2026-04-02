// ── Catalog & Search ──────────────────────────────────────────────────────────

export type CatalogItemStatus = 'Draft' | 'Active' | 'Archived'

export interface CatalogItem {
  id: string
  title: string
  description: string
  categoryId: string
  /** Multi-entry indexed for fast tag filtering */
  tags: string[]
  price: number
  stock: number
  imageUrls: string[]
  status: CatalogItemStatus
  /** Words flagged by the moderation engine */
  moderationFlags: string[]
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
