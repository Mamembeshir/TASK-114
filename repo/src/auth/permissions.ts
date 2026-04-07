import { Role } from '@/types'

// ── Permission constants ───────────────────────────────────────────────────────
// Each string is a capability key used across the codebase.
// Keep sections grouped by feature area for readability.

export const Permission = {
  // ── Users & Admin ──────────────────────────────────────────────────────────
  /** Create, edit, deactivate user accounts */
  manageUsers: 'manageUsers',
  /** View the system audit log */
  viewAuditLog: 'viewAuditLog',
  /** Edit global system configuration (word filters, retention defaults, etc.) */
  manageSystem: 'manageSystem',

  // ── Auctions ───────────────────────────────────────────────────────────────
  /** Browse and view auction listings */
  viewAuctions: 'viewAuctions',
  /** Create new auction listings */
  createAuction: 'createAuction',
  /** Edit, cancel, or delete any auction */
  manageAuctions: 'manageAuctions',
  /** Place bids and proxy bids; requires an active wallet */
  placeBid: 'placeBid',
  /** Top-up, adjust, or review participant wallets */
  manageWallets: 'manageWallets',

  // ── Catalog ────────────────────────────────────────────────────────────────
  /** Browse catalog items */
  viewCatalog: 'viewCatalog',
  /** Create and edit catalog items */
  createCatalogItem: 'createCatalogItem',
  /** Approve or reject catalog items submitted for review */
  moderateCatalogItem: 'moderateCatalogItem',
  /** Full catalog admin: delete, bulk-edit, manage categories & tags */
  manageCatalog: 'manageCatalog',

  // ── Publishing Workbench ───────────────────────────────────────────────────
  /** Read published announcements and notices */
  viewPublications: 'viewPublications',
  /** Draft and submit publications for review */
  createPublication: 'createPublication',
  /** Approve, reject, or roll back publication versions */
  approvePublication: 'approvePublication',
  /** Manage all publications, including deletion and scheduling */
  managePublications: 'managePublications',

  // ── Documents & Archive ────────────────────────────────────────────────────
  /** Browse the document library */
  viewDocuments: 'viewDocuments',
  /** Upload new documents and create new versions */
  createDocument: 'createDocument',
  /** Check out / return documents; download watermarked copies */
  checkoutDocument: 'checkoutDocument',
  /** Assign document numbers and approve submitted documents */
  approveDocument: 'approveDocument',
  /** Initiate or second-approve destruction requests */
  approveDestruction: 'approveDestruction',
  /** Full document admin: manage retention policies, purge drafts */
  manageDocuments: 'manageDocuments',

  // ── Training ───────────────────────────────────────────────────────────────
  /** Access and progress through training courses */
  viewTraining: 'viewTraining',

  // ── Message Center ─────────────────────────────────────────────────────────
  /** View received notifications and announcements */
  viewMessages: 'viewMessages',
  /** Compose and send messages / bulk notifications */
  sendMessage: 'sendMessage',
  /** Manage outbound queue, export logs, delete messages */
  manageMessages: 'manageMessages',
} as const

export type Permission = (typeof Permission)[keyof typeof Permission]

// ── Role → Permission matrix ───────────────────────────────────────────────────
// Explicit allow-list per role.  If a permission is not listed here, it is denied.

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Role.Administrator]: [
    // Full system access
    Permission.manageUsers,
    Permission.viewTraining,
    Permission.viewAuditLog,
    Permission.manageSystem,

    Permission.viewAuctions,
    Permission.createAuction,
    Permission.manageAuctions,
    Permission.placeBid,
    Permission.manageWallets,

    Permission.viewCatalog,
    Permission.createCatalogItem,
    Permission.moderateCatalogItem,
    Permission.manageCatalog,

    Permission.viewPublications,
    Permission.createPublication,
    Permission.approvePublication,
    Permission.managePublications,

    Permission.viewDocuments,
    Permission.createDocument,
    Permission.checkoutDocument,
    Permission.approveDocument,
    Permission.approveDestruction,
    Permission.manageDocuments,

    Permission.viewMessages,
    Permission.sendMessage,
    Permission.manageMessages,
  ],

  [Role.ContentEditor]: [
    Permission.viewTraining,
    Permission.viewAuctions,
    Permission.createAuction,

    Permission.viewCatalog,
    Permission.createCatalogItem,

    Permission.viewPublications,
    Permission.createPublication,

    Permission.viewDocuments,
    Permission.createDocument,
    Permission.checkoutDocument,

    Permission.viewMessages,
    Permission.sendMessage,
  ],

  [Role.ReviewerApprover]: [
    Permission.viewTraining,
    Permission.viewAuditLog,

    Permission.viewAuctions,
    Permission.manageAuctions,

    Permission.viewCatalog,
    Permission.moderateCatalogItem,

    Permission.viewPublications,
    Permission.approvePublication,

    Permission.viewDocuments,
    Permission.checkoutDocument,
    Permission.approveDocument,

    Permission.viewMessages,
  ],

  [Role.Participant]: [
    Permission.viewTraining,
    Permission.viewAuctions,
    Permission.placeBid,

    Permission.viewCatalog,

    Permission.viewPublications,

    Permission.viewDocuments,
    Permission.checkoutDocument,

    Permission.viewMessages,
  ],
}

/** Returns true when the given role has the given permission. */
export function hasPermission(role: Role, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission)
}
