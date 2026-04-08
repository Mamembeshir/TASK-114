// ── Append-only Audit Log ─────────────────────────────────────────────────────

export type AuditEventType =
  // User events
  | 'user.login'
  | 'user.logout'
  | 'user.created'
  | 'user.updated'
  | 'user.activated'
  | 'user.deactivated'
  | 'user.password_reset'
  | 'user.role_changed'
  // Auction events
  | 'auction.created'
  | 'auction.updated'
  | 'auction.published'
  | 'auction.cancelled'
  | 'auction.activated'
  | 'auction.closed'
  | 'auction.no_sale'
  // Bid events
  | 'bid.placed'
  | 'bid.proxy_resolved'
  | 'bid.won'
  // Wallet events
  | 'wallet.credited'
  | 'wallet.debited'
  | 'wallet.deposit_deducted'
  | 'wallet.reserve_placed'
  | 'wallet.reserve_released'
  // Catalog events
  | 'catalog.created'
  | 'catalog.updated'
  | 'catalog.published'
  | 'catalog.archived'
  | 'catalog.moderation_approved'
  | 'catalog.moderation_rejected'
  | 'catalog.review_submitted'
  | 'catalog.review_removed'
  // Publication events
  | 'publication.created'
  | 'publication.updated'
  | 'publication.submitted'
  | 'publication.approved'
  | 'publication.rejected'
  | 'publication.published'
  | 'publication.rollback'
  // Document events
  | 'document.created'
  | 'document.updated'
  | 'document.submitted'
  | 'document.approved'
  | 'document.rejected'
  | 'document.checked_out'
  | 'document.checked_in'
  | 'document.checkout_released'
  | 'document.destruction_requested'
  | 'document.destruction_reviewer_approved'
  | 'document.destruction_admin_approved'
  | 'document.destruction_rejected'
  | 'document.destroyed'
  | 'document.template_created'
  // Training events
  | 'training.course_created'
  | 'training.course_updated'
  | 'training.course_deactivated'
  | 'training.section_completed'
  | 'training.course_completed'
  // System events
  | 'system.config_updated'
  | 'system.sensitive_word_added'
  | 'system.sensitive_word_removed'
  | 'system.data_imported'

export interface AuditLog {
  id: string
  eventType: AuditEventType
  /** userId of the person who triggered the event */
  actorId: string
  /** Denormalized display name — preserved even if user is deactivated */
  actorName: string
  /** e.g. 'User' | 'Auction' | 'Bid' | 'Document' */
  entityType: string
  entityId: string
  /** Human-readable summary of what happened */
  description: string
  /** Optional extra context (old/new values, amounts, etc.) */
  metadata?: Record<string, unknown>
  /** Immutable creation timestamp — never updated */
  createdAt: number
}
