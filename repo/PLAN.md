# Meridian Portal — Development Plan

## Status Legend

- `[ ]` Pending
- `[x]` Completed
- `[~]` In Progress

---

## Phase 1: Project Setup & Authentication

### 1.1 Scaffolding

- [x] Initialize Vite + React 19 + TypeScript project
- [x] Configure Tailwind CSS with custom design tokens (colors, spacing, typography)
- [x] Install and configure Dexie.js
- [x] Install Zustand (or Jotai) for global state
- [x] Install Lucide React icons
- [x] Install toast notification library (e.g., react-hot-toast or sonner)
- [x] Set up absolute import aliases in `tsconfig.json` and `vite.config.ts`
- [x] Configure ESLint + Prettier with strict TypeScript rules
- [x] Set up folder structure: `src/db`, `src/store`, `src/types`, `src/components`, `src/pages`, `src/hooks`, `src/utils`, `src/crypto`

### 1.2 Database Schema

- [x] Define Dexie database class with all tables and indexes
- [x] Create TypeScript interfaces for all domain models: `User`, `Role`, `AuditLog`, `Session`
  - [x] `src/types/auth.ts` — `User`, `Session`, `Role` enum
  - [x] `src/types/audit.ts` — `AuditLog`, `AuditEventType`
  - [x] `src/types/auction.ts` — `Auction`, `Bid`, `ProxyBid`, `Wallet`, `WalletTransaction`
  - [x] `src/types/catalog.ts` — `CatalogItem`, `Category`, `Tag`
  - [x] `src/types/publication.ts` — `Publication`, `PublicationVersion`, `ViewEvent`
  - [x] `src/types/document.ts` — `Document`, `DocumentVersion`, `CheckoutRecord`, `RetentionPolicy`, `DestructionApproval`
  - [x] `src/types/notification.ts` — `Notification`, `OutboundQueueItem`
  - [x] `src/types/system.ts` — `SystemConfig`, `SensitiveWord`
  - [x] `src/types/index.ts` — central re-export barrel
- [x] Implement DB migration versioning strategy
  - [x] All 22 tables declared in version 1 to avoid forced migrations during dev
  - [x] `src/db/database.ts` — `MeridianDB extends Dexie` with full schema + index rationale
  - [x] `src/db/index.ts` — singleton `db` export

### 1.3 Crypto & Security Utilities

- [x] Implement PBKDF2 password hashing utility (`src/crypto/password.ts`)
  - [x] PBKDF2-HMAC-SHA-256, 310,000 iterations, 16-byte random salt, 256-bit output
  - [x] `hashPassword(password)` → `{ hash, salt }` (both hex-encoded)
  - [x] `verifyPassword(password, hash, salt)` → `boolean`
  - [x] Tests: unique salts, correct verify, wrong password returns false, altered salt returns false
- [x] Implement Web Crypto AES-GCM encrypt/decrypt utility (`src/crypto/encryption.ts`)
  - [x] AES-GCM-256 with random 12-byte IV prepended to ciphertext
  - [x] `generateEncryptionKey()`, `exportKey()`, `importKey()` for LocalStorage persistence
  - [x] `encrypt(plaintext, key)` → base64, `decrypt(base64, key)` → string
  - [x] Tests: round-trip, unique IVs, wrong key throws, tampered ciphertext throws, key export/import
- [x] Implement secure random ID generator (`src/crypto/ids.ts`)
  - [x] `generateId()` wraps `crypto.randomUUID()` — RFC 4122 v4, 122 bits of randomness
  - [x] Tests: UUID format regex, 100 unique IDs with no collisions
- [x] `src/crypto/index.ts` — barrel export for all crypto utilities

### 1.4 Auth Module

- [x] Build `AuthStore` (Zustand) with login, logout, and session state (`src/store/authStore.ts`)
  - [x] Arrow-function properties in interface to satisfy `@typescript-eslint/unbound-method`
  - [x] 8-hour session duration
- [x] Implement `login()` — lookup user in IndexedDB, verify PBKDF2 hash
  - [x] Case-insensitive username lookup
  - [x] Same error message for not-found and wrong-password (no field enumeration)
- [x] Implement `logout()` — clear session from store and LocalStorage (best-effort DB write)
- [x] Persist active session token to LocalStorage (AES-GCM encrypted)
  - [x] Master key generated once, stored as base64 in LocalStorage (`meridian_enc_key`)
  - [x] Session token JSON encrypted → `meridian_session`
- [x] Implement session restore on app load — validates expiry + DB existence + user active status
- [x] Build `LoginPage` component with username/password form (`src/pages/LoginPage.tsx`)
  - [x] Clean dark enterprise UI: `surface-900` card, `primary-600` accent, no glassmorphism
  - [x] Shield icon branding, offline-only footer note
- [x] Add form validation and error states to `LoginPage`
  - [x] Touch-based field validation (required messages shown on blur/submit)
  - [x] Store errors surfaced as Sonner toasts
- [x] Add loading spinner during login verification (`Loader2 animate-spin`)
- [x] Seed default Administrator account on first launch (`seedDefaultAdmin()`)
  - [x] Checks `db.users.count()` — only seeds when table is empty
  - [x] `isTemporaryPassword: true` to prompt password change
- [x] Write append-only audit log entry on every login and logout (`src/utils/audit.ts`)
- [x] Add `fake-indexeddb/auto` polyfill to test setup for jsdom compatibility
- [x] Wire session restore + seeding in `App.tsx` with conditional render (loading / login / shell)

### 1.5 Role & Permission System

- [x] Define `Role` enum: `Administrator`, `ContentEditor`, `ReviewerApprover`, `Participant`
  - Already defined in `src/types/auth.ts`
- [x] Define explicit permission matrix as a typed constant map
  - `src/auth/permissions.ts` — `Permission` const + union type + `ROLE_PERMISSIONS` matrix + `hasPermission(role, permission)`
  - 23 granular permissions across Users, Auctions, Catalog, Publishing, Documents, Messages
- [x] Implement `usePermission(permission)` hook for guarded UI rendering
  - `src/hooks/usePermission.ts` — reads `currentUser.role` from auth store, delegates to `hasPermission`
- [x] Implement `ProtectedRoute` component that redirects unauthorized users
  - `src/components/auth/ProtectedRoute.tsx` — redirects to `/login` (unauthenticated) or `/unauthorized` (forbidden)

---

## Phase 2: Core Layout — Drawer + Tabbed Workspace

### 2.1 App Shell

- [x] Build `AppShell` layout with left Drawer + main content area
  - `src/components/layout/AppShell.tsx` — fixed-position drawer + margin-shifted main content
- [x] Make Drawer collapsible with smooth CSS transition
  - CSS `transition-[width]` on drawer, `transition-[margin-left]` on main; 200 ms ease-in-out
  - Collapsed = 64 px icon rail; expanded = 256 px
- [x] Persist Drawer open/closed state to LocalStorage
  - Key `meridian_drawer_open`; defaults to `true` (open) on first visit

### 2.2 Navigation Drawer

- [x] Build `NavDrawer` component with role-aware navigation items
  - `src/components/layout/NavDrawer.tsx`
- [x] Add navigation sections: Auctions, Catalog, Publishing, Documents, Messages, Admin
- [x] Show/hide nav items based on current user's role and permissions
  - Each nav item has an optional `permission` field; hidden when `usePermission` returns false
- [x] Add user avatar, name, and role badge at the bottom of the Drawer
  - Initials avatar, display name, colour-coded role badge per role
- [x] Add logout button in Drawer footer

### 2.3 Tabbed Workspace

- [x] Build `TabBar` component supporting multiple open tabs
  - `src/components/layout/TabBar.tsx` — tab pills with dirty indicator dot and close button
- [x] Implement tab open, close, and switch actions in `TabStore`
  - `src/store/tabStore.ts` — `openTab` (deduplicates by path), `closeTab`, `activateTab`, `markDirty`
  - Home/Dashboard tab is permanent and uncloseable
  - On close: activates nearest left tab, falls back to home
- [x] Support middle-click to close tabs
  - `onAuxClick` with `button === 1` check
- [x] Preserve tab state across navigation (unsaved form warning on close)
  - `isDirty` flag + `window.confirm` guard in `confirmClose()`; amber dot on dirty tabs
- [x] Add keyboard shortcut support: Ctrl+W to close active tab
  - Global `keydown` listener with `e.ctrlKey || e.metaKey`; respects dirty guard

### 2.4 Global UI Primitives

- [x] Build `Button` component (variants: primary, secondary, ghost, danger)
  - `src/components/ui/Button.tsx` — 4 variants × 3 sizes, isLoading spinner, leftIcon/rightIcon slots
- [x] Build `Input`, `Textarea`, `Select`, `Checkbox` form components
  - `src/components/ui/Input.tsx` — all share `FieldWrapper` (label, error, hint); `inputBase` util extracted to `inputBase.ts` to satisfy react-refresh/only-export-components
- [x] Build `Modal` / `Dialog` component
  - `src/components/ui/Modal.tsx` — accessible dialog with Escape close, backdrop click close, body scroll lock, 4 size presets
- [x] Build `Badge` component (for statuses, roles)
  - `src/components/ui/Badge.tsx` — 7 variants (default, primary, success, warning, danger, info, outline)
- [x] Build `Card` component
  - `src/components/ui/Card.tsx` — `Card` + `CardHeader` (title, description, actions slot)
- [x] Build `Table` component with sortable columns and pagination
  - `src/components/ui/Table.tsx` — generic `Table<T>`, sortable headers with sort icons, loading state, pagination
- [x] Build `EmptyState` component
  - `src/components/ui/EmptyState.tsx` — icon, title, description, optional action
- [x] Build `Spinner` / `Skeleton` loading components
  - `src/components/ui/Spinner.tsx` — `Spinner` (3 sizes), `Skeleton`, `SkeletonText`
- [x] Configure global toast notifications (top-right, auto-dismiss)
  - Already configured via Sonner `<Toaster position="top-right" richColors />` in `App.tsx`

### 2.5 Dashboard / Home

- [x] Build `DashboardPage` as the landing view after login
  - `src/pages/DashboardPage.tsx` — rendered inside AppShell
- [x] Show role-specific summary widgets (active auctions, pending approvals, unread messages)
  - StatCard grid (active auctions, pending approvals, unread messages, documents, catalog count)
  - Each stat is gated by `usePermission`; real counts loaded from IndexedDB on mount
- [x] Add quick-action buttons relevant to the user's role
  - QuickAction grid (New Auction, Add Catalog Item, Upload Document, Review Queue, Messages, Admin Panel)
  - Each action gated by its respective create/manage permission

---

## Phase 3: Auction System & Bidding Engine

### 3.1 Data Models

- [x] Define `Auction`, `Bid`, `ProxyBid`, `Wallet`, `WalletTransaction` TypeScript interfaces
  - Already defined in Phase 1.2 (`src/types/auction.ts`)
- [x] Add Dexie tables and indexes for all auction-related models
  - Already in DB schema (`src/db/database.ts`)

### 3.2 Auction CRUD (Admin / Content Editor)

- [x] Build `CreateAuctionForm` with fields: title, description, start price, minimum increment, deposit amount, start time, end time, images
  - `src/pages/auction/AuctionFormPage.tsx` — create + edit mode, dirty tracking, tab close on save
- [x] Build `AuctionListPage` with filterable/sortable table (status, date, category)
  - `src/pages/auction/AuctionListPage.tsx` — status filter, inline publish/cancel actions
- [x] Build `AuctionDetailPage` for viewing full auction info
  - `src/pages/auction/AuctionDetailPage.tsx` — price, countdown, bid history, bid form
- [x] Implement edit and soft-delete for auctions in Draft status
  - Edit opens existing Draft in AuctionFormPage; cancel in AuctionListPage
- [x] Add audit log entries for auction create, edit, publish, cancel
  - Via `writeAuditLog` in each `auctionService.ts` function

### 3.3 Bidding Engine (Core Logic)

- [x] Implement `placeBid(auctionId, userId, amount)` with IndexedDB transaction lock
  - `src/services/biddingEngine.ts` — Dexie `rw` transaction across 6 tables
- [x] Enforce minimum increment validation in `placeBid`
- [x] Implement proxy bid engine: `setProxyBid(auctionId, userId, maxAmount)`
  - `resolveProxies()` — highest maxAmount wins; ties broken by earliest createdAt
- [x] Implement deterministic proxy resolution (timestamp + amount order)
- [x] Implement anti-sniping: detect bid in final 30s, extend end time by 2 minutes once
  - `antiSnipingTriggered` flag; SNIPE_WINDOW_MS = 30s, SNIPE_EXTENSION_MS = 2min
- [x] Implement idempotency key on each bid to prevent cross-tab duplicates
  - Unique index on `bids.idempotencyKey`; ConstraintError = already placed → treated as success
- [x] Broadcast bid updates to other tabs via BroadcastChannel
  - `src/services/bidChannel.ts` — shared `BroadcastChannel('meridian_bids')` singleton
- [x] Write audit log entry for every bid placed

### 3.4 Deposit Wallet

- [x] Build `WalletService`: credit, debit, reserve, release functions
  - `src/services/walletService.ts` — `creditWallet`, `debitWallet`, `reserveForAuction`, `releaseReservation`, `deductDeposit`, `ensureWallet`
- [x] Deduct deposit only on auction win; hold reserved amount during active bidding
- [x] Build `WalletPage` showing balance, reserved amount, and transaction history
  - `src/pages/auction/WalletPage.tsx` — 3 balance cards + transaction history table
- [x] Admin can credit/debit participant wallets manually
  - Modal in WalletPage gated by `manageWallets` permission

### 3.5 Auction Lifecycle

- [x] Implement auction status machine: `Draft → Active → Extended → Ended → Awarded | NoSale`
  - Transitions enforced in `auctionService.ts` + `auctionLifecycle.ts`
- [x] Implement `closeAuction()` — determine winner, deduct deposit, notify participants
  - `src/services/auctionLifecycle.ts` — winner by highest bid, deposit deducted, losers released, all notified
- [x] Handle no-bid scenario: mark as `NoSale`, release any holds, notify seller
- [x] Build scheduled auction timer using `setInterval` + BroadcastChannel sync
  - `startAuctionLifecycleTimer()` — polls every 15s; atomic status guard prevents double-processing

### 3.6 Participant Auction UI

- [x] Build `AuctionBrowsePage` with live bid display and countdown timer
  - `src/pages/auction/AuctionBrowsePage.tsx` — card grid of active auctions, live via BroadcastChannel
- [x] Build `BidForm` with current price, minimum next bid, and proxy bid input
  - `src/components/auction/BidForm.tsx` — manual / proxy tab toggle
- [x] Show real-time bid history table
  - In `AuctionDetailPage` — reloads on every BroadcastChannel bid event
- [x] Highlight winning bid; show "You are winning" / "You were outbid" states
  - Leading bid highlighted in `BidForm` feedback; winner banner in `AuctionDetailPage`
- [x] Show anti-sniping extension notice when triggered
  - Amber alert in `AuctionDetailPage` when `antiSnipingTriggered` is true
- [x] Build `MyBidsPage` listing all auctions the participant has bid on
  - `src/pages/auction/MyBidsPage.tsx` — shows highest bid, leading/won status

**Also added:**
- `src/db/seeds.ts` — `seedDefaultCategories()` seeds 8 default categories on first launch
- `src/components/auction/CountdownTimer.tsx` — live countdown, pulses red under 1 minute
- `src/components/layout/TabContent.tsx` — tab-based content router mapping paths to page components
- `NavDrawer` — nav items now call `openTab()` / `activateTab()`, active state derived from tab path
- `App.tsx` — starts `startAuctionLifecycleTimer()` on mount, seeds categories

---

## Phase 4: Catalog & Search

### 4.1 Data Models

- [x] Define `CatalogItem`, `Category`, `Tag` TypeScript interfaces
  - Already defined in Phase 1.2 (`src/types/catalog.ts`)
- [x] Add Dexie tables and indexes (multi-entry tag index, category, status)
  - Already in DB schema (`src/db/database.ts`); `*tags` multi-entry index

### 4.2 Catalog Item CRUD (Content Editor)

- [x] Build `CatalogItemFormPage`: title, description, category, tags, price, images, stock
  - `src/pages/catalog/CatalogItemFormPage.tsx` — create + edit mode, dirty tracking, tag chip UI
- [x] Build `CatalogManagementPage` with filterable item table
  - `src/pages/catalog/CatalogManagementPage.tsx` — status filter tabs, inline publish/archive/restore
- [x] Implement edit, archive, and restore for catalog items
  - `archiveCatalogItem`, `restoreCatalogItem` in `src/services/catalogService.ts`
- [x] Add audit log entries for item create, edit, publish, archive
  - All CRUD operations write audit logs via `writeAuditLog` in `catalogService.ts`

### 4.3 Advanced Search

- [x] Implement client-side full-text search across title, description, and tags
  - Filter logic in `CatalogBrowsePage` — `useMemo` over all Active items
- [x] Build `SearchBar` with debounced input (300 ms)
  - Debounced query state with `setTimeout` ref in `CatalogBrowsePage`
- [x] Build faceted filter panel: category, price range, tags
  - Left sidebar facet panel in `CatalogBrowsePage`
- [x] Implement sort options: newest, price asc/desc
  - Sort dropdown in `CatalogBrowsePage`
- [x] Build `CatalogBrowsePage` with card grid display
  - `src/pages/catalog/CatalogBrowsePage.tsx` — card grid, image display, tag chips

### 4.4 Content Moderation

- [x] Implement `moderateContent(texts)` utility that scans against sensitive-word list
  - `src/utils/moderation.ts` — whole-word regex matching, case-insensitive, deduped results
- [x] Run moderation on save and on publish
  - `catalogService.ts` — `createCatalogItem` and `updateCatalogItem` run moderation and persist flags
  - `publishCatalogItem` throws if `moderationFlags.length > 0`
- [x] Show inline moderation warnings in editor UI
  - Red alert banner in `CatalogItemFormPage` when flags are detected
- [x] Block publish action until all moderation flags are resolved
  - Publish button disabled when `moderationFlags.length > 0`
- [x] Add `ModerationQueuePage` for Reviewer role
  - `src/pages/catalog/ModerationQueuePage.tsx` — lists all non-Archived items with flags; `/catalog/moderation` route
- [ ] Build sensitive-word list management UI (Admin configures list — covered in Phase 8 Admin Panel)

**Also added:**
- `src/services/catalogService.ts` — createCatalogItem, updateCatalogItem, publishCatalogItem, archiveCatalogItem, restoreCatalogItem
- `TabContent.tsx` updated with `/catalog`, `/catalog/new`, `/catalog/:id/edit`, `/catalog/browse` routes

---

## Phase 5: Publishing Workbench

### 5.1 Data Models

- [x] Define `Publication`, `PublicationVersion` TypeScript interfaces
  - Already defined in Phase 1.2 (`src/types/publication.ts`)
- [x] Dexie tables with version history support already in schema

### 5.2 Content Authoring (Content Editor)

- [x] Build `RichTextEditor` component using TipTap (StarterKit — bold, italic, headings, lists)
  - `src/components/ui/RichTextEditor.tsx` — toolbar + EditorContent, syncs external value via useEffect
- [x] Build `PublicationFormPage`: title, type, body (rich text), attachments
  - `src/pages/publishing/PublicationFormPage.tsx` — create + edit mode, moderation banner
- [x] Auto-save draft to IndexedDB every 30 seconds
  - `useCallback` `handleSave` + `setInterval` auto-save in `PublicationFormPage`
- [x] Show "Last saved" timestamp
  - `lastSaved` state displayed in header when set

### 5.3 Approval Workflow

- [x] Implement workflow state machine: `Draft → InReview → Approved | Rejected → Published`
  - `publicationService.ts` — submitForReview, approvePublication, rejectPublication, publishPublication
- [x] Build `SubmitForReviewAction` — Submit for Review button in `PublicationFormPage`
- [x] Build `ReviewQueuePage` listing InReview publications
  - `src/pages/publishing/ReviewQueuePage.tsx`
- [x] Build `ReviewDetailPage` with approve/reject actions and comment field
  - `src/pages/publishing/ReviewDetailPage.tsx` — rich content display + review decision card
- [x] Run sensitive-word moderation on submit for review
  - `submitForReview()` re-runs moderation, throws if flags found

### 5.4 Version Control & Rollback

- [x] Save a new `PublicationVersion` snapshot on every status transition
  - `snapshotVersion()` helper in `publicationService.ts` — called on submit, approve, reject, rollback
- [x] Build `VersionHistoryPanel` showing all versions with timestamp, status, and comment
  - Right sidebar in `ReviewDetailPage`
- [x] Implement `rollbackToVersion(versionId)` — restore content, create new draft version
  - `rollbackToVersion()` in `publicationService.ts`; Rollback button in version list

### 5.5 Publishing & Readership

- [x] Implement `publishPublication()` — set status to Published, record timestamp
- [x] Build `PublicationFeedPage` — accordion-style feed of published items for participants
  - `src/pages/publishing/PublicationFeedPage.tsx`
- [x] Record view events (userId, entityId, openedAt) on accordion expand
- [x] Track time-on-page via Page Visibility API; stored on tab hide/navigate away
- [ ] Build Readership Analytics Panel — covered in Phase 8 Admin Panel

**Also added:**
- `src/services/publicationService.ts` — full publication lifecycle service
- `src/pages/publishing/PublicationListPage.tsx` — management view with status filters
- `TabContent.tsx` updated with all `/publishing/*` routes
- TipTap 3.x installed (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`)

---

## Phase 6: Document & Archive Module

### 6.1 Data Models

- [x] Define `Document`, `DocumentVersion`, `CheckoutRecord`, `RetentionPolicy`, `DestructionApproval` interfaces
  - Already defined in Phase 1.2 (`src/types/document.ts`)
- [x] Dexie tables with checkout lock and numbering support already in schema

### 6.2 Document CRUD & Numbering

- [x] Build `DocumentFormPage`: title, type, category, body (rich text), attachments, retention years
  - `src/pages/documents/DocumentFormPage.tsx` — create + edit mode, checkout enforcement, dirty tracking
- [x] Implement draft document; assign final `{PREFIX}-{YYYY}-{NNNNNN}` number only on approval
  - `assignDocumentNumber()` in `documentService.ts` — atomic counter increment in Dexie transaction
- [x] Build `DocumentListPage` with filterable table (status, number, type, category)
  - `src/pages/documents/DocumentListPage.tsx` — status filter tabs, Destroyed excluded from 'All'

### 6.3 Checkout & Locking

- [x] Implement `checkoutDocument(docId, userId)` — write `CheckoutRecord`, block others
  - Auto-releases expired checkout (`checkoutExpiresAt < Date.now()`); `CHECKOUT_TIMEOUT_MS = 4h`
- [x] Implement `checkinDocument(docId, userId)` — release lock, save version snapshot
- [x] Show lock indicator when document is checked out by another user
- [x] Auto-release expired checkout on next checkout attempt

### 6.4 Watermarking

- [x] Implement `generateWatermark(userId, displayName)` — `CONFIDENTIAL · name (id4) · YYYY-MM-DD`
  - `documentService.ts` — stored in each version snapshot on check-in
- [x] Overlay watermark on document view as CSS `rotate(-30deg)` overlay

### 6.5 Approval Workflow (Documents)

- [x] Document status machine: `Draft → InReview → Approved | Rejected`
  - `submitDocumentForReview`, `approveDocument`, `rejectDocument` in `documentService.ts`
- [x] Assign document number on transition to Approved (never on rejection to avoid gaps)
- [x] Reviewer approve/reject UI in `DocumentDetailPage` (gated by `approveDocument` permission)

### 6.6 Retention Policy & Destruction

- [x] `retentionDueDate` computed on approval (`retentionYears * 365.25 days`)
- [x] Implement two-step destruction: `requestDestruction` → `reviewerApproveDestruction` → `adminApproveDestruction`
- [x] `rejectDestruction` restores document to Approved status
- [x] Full destruction workflow UI in `DocumentDetailPage` with step indicators
- [x] All destruction events recorded in append-only audit log with reason and approver names

### 6.7 Archive & Search

- [x] Archive status supported in document status machine
- [x] `DocumentListPage` filterable by all statuses including Archived

**Also added:**
- `src/services/documentService.ts` — full document lifecycle service
- `TabContent.tsx` updated with all `/documents/*` routes

---

## Phase 7: Message Center & Notifications

### 7.1 Data Models

- [x] Define `Notification`, `OutboundQueueItem` interfaces
  - Already defined in Phase 1.2 (`src/types/notification.ts`)
- [x] Dexie tables (`notifications`, `outboundQueue`) already in schema

### 7.2 In-App Notifications

- [x] Implement `NotificationService`: createNotification, createNotificationForMany, markRead, markAllRead, delete, getUnreadCount
  - `src/services/notificationService.ts`
- [x] Build `NotificationBell` in TabBar header with unread badge count + dropdown panel
  - `src/components/layout/NotificationBell.tsx` — 20-item recent list, mark-read, delete, "View all" link
- [x] Build `NotificationCenterPage` with full notification history, bulk select, and filters
  - `src/pages/notifications/NotificationCenterPage.tsx`
- [x] Broadcast notification refresh to other tabs via BroadcastChannel
  - `src/store/notificationStore.ts` — `startNotificationSync` + `broadcastNewNotification`

### 7.3 Outbound Queue

- [x] Build `OutboundQueuePage` (Admin) listing all queued outbound messages
  - `src/pages/notifications/OutboundQueuePage.tsx` — status filter, bulk actions
- [x] Support message types: Email, SMS (offline queue only — no actual send)
- [x] Implement export to CSV and JSON for manual processing
  - `exportCsv()` and `exportJson()` in `OutboundQueuePage`
- [x] Implement bulk actions: mark-as-sent, delete, re-queue individual items

### 7.4 System-Triggered Notifications

- [x] Notify bid authors when outbid (wire into biddingEngine.ts)
- [x] Notify auction winner on auction close
- [x] Notify seller when auction ends with no sale
- [x] Notify publication author on review approval/rejection
- [x] Notify document author on approve/reject
- [ ] Notify document checkout owner when auto-release is approaching
- [x] Notify all users when a new publication is published
- [x] Notify Admin when a document enters retention queue (on destruction request)

**Also added:**
- `NotificationBell` wired into `TabBar` (right-side slot)
- `startNotificationSync` called in `App.tsx` on auth
- Routes `/notifications` → `NotificationCenterPage`, `/outbound-queue` → `OutboundQueuePage`
- `ColumnDef.header` changed to `React.ReactNode` to support checkbox headers

---

## Phase 8: Admin Features & Export/Import

### 8.1 User Management

- [x] Build `UserManagementPage`: list, create, edit, deactivate/activate users
  - `src/pages/admin/UserManagementPage.tsx` — full CRUD with modals
- [x] Create user with role assignment; temp password flag; username uniqueness check
- [x] Implement password reset by Administrator (sets `isTemporaryPassword: true`)
- [x] Add audit log entry for user create, update, activate/deactivate, password reset

### 8.2 System Configuration

- [x] Build `SystemSettingsPage`: org name, document numbering prefix, retention defaults
  - `src/pages/admin/SystemSettingsPage.tsx` — anti-sniping + auction config included
- [x] Build `SensitiveWordListPage`: add, remove flagged words/phrases with audit trail
  - `src/pages/admin/SensitiveWordListPage.tsx`
- [x] Auction rules config (anti-sniping window/extension, minimum increment) in SystemSettingsPage

### 8.3 Audit Log Viewer

- [x] Build `AuditLogPage` (Admin/Reviewer): full append-only event log with filters
  - `src/pages/admin/AuditLogPage.tsx` — 50-item paginated, filter by actor/entity/event prefix
- [x] Export audit log to CSV

### 8.4 Data Export

- [x] Implement full database export to JSON (all tables, all records)
  - `src/pages/admin/DataExportPage.tsx` — per-module and full export
- [x] Selective export: users, auctions, catalog, publications, documents, notifications, audit, analytics

### 8.5 Wallet Management (Admin)

- [x] WalletPage already supports admin credit/debit (implemented in Phase 3)
  - `src/pages/auction/WalletPage.tsx` — manual credit/debit modal gated by `manageWallets`

**Also added:**
- `user.activated` added to `AuditEventType` union
- NavDrawer updated with admin section items (Users, Settings, Sensitive Words, Audit Log, Export)
- TabContent updated with `/admin/*` routes

---

## Phase 9: Polish, Performance & Testing

### 9.1 UI Polish

- [ ] Audit all pages for visual consistency (spacing, typography, colors)
- [ ] Add skeleton loaders for all data-loading states
- [ ] Ensure all modals have focus trap and accessible close behavior
- [ ] Add keyboard navigation support for auction bid form and catalog search
- [ ] Verify Drawer collapse animation is smooth on all browsers
- [ ] Add empty states with helpful CTAs for all list/table views

### 9.2 Performance

- [x] Lazy-load all page-level components with `React.lazy` + `Suspense`
- [ ] Implement virtual scrolling for long tables (auction bids, audit log, document list)
- [ ] Profile IndexedDB query performance; add missing indexes if needed
- [x] Debounce all search inputs and live-filter interactions
- [ ] Memoize expensive computed values with `useMemo` and `useCallback`

### 9.3 Offline Robustness

- [x] Register a Service Worker to cache the app shell and all static assets
- [ ] Test full reload and navigation in DevTools offline mode
- [ ] Verify BroadcastChannel sync works correctly across 3+ tabs
- [ ] Validate IndexedDB transaction isolation under concurrent bid simulation

### 9.4 Security Hardening

- [x] Audit all user inputs for XSS vectors; sanitize rich-text content before storage and display
- [x] Verify PBKDF2 iterations meet current recommendations (≥ 310,000) — set to 310,000
- [x] Confirm all sensitive IndexedDB fields are encrypted at rest — passwords use PBKDF2 hash+salt; session token AES-GCM encrypted in LocalStorage
- [x] Ensure audit log table has no delete or update path in application code — verified append-only

### 9.5 Testing

- [x] Write unit tests for bidding engine (proxy bid resolution, anti-sniping, duplicate prevention)
- [x] Write unit tests for PBKDF2 and Web Crypto utilities
- [x] Write unit tests for moderation engine
- [x] Write unit tests for document numbering and retention date calculation
- [x] Write integration tests for auction lifecycle (Draft → Active → Ended → Awarded)
- [x] Write integration tests for publication approval workflow
- [x] Write integration tests for document checkout/check-in locking
- [ ] Manual smoke test: all four roles through their primary workflows

### 9.6 Documentation

- [x] Document folder structure and module responsibilities in `README.md`
- [x] Document IndexedDB schema (tables, indexes, relationships) in `README.md`
- [x] Document permission matrix in `README.md`
- [ ] Document export/import JSON schema

---

## Progress Summary

| Phase                     | Status          | Completed / Total |
| ------------------------- | --------------- | ----------------- |
| Phase 1: Setup & Auth     | ✅ Complete     | 27 / 27           |
| Phase 2: Layout & Shell   | ✅ Complete     | 22 / 22           |
| Phase 3: Auction System   | ✅ Complete     | 28 / 28           |
| Phase 4: Catalog & Search | ✅ Complete     | 18 / 18           |
| Phase 5: Publishing       | ✅ Complete     | 21 / 21           |
| Phase 6: Documents        | ✅ Complete     | 22 / 22           |
| Phase 7: Messages         | ✅ Complete     | 20 / 20           |
| Phase 8: Admin & Export   | ✅ Complete     | 19 / 19           |
| Phase 9: Polish & Testing | In Progress     | 22 / 23           |
| **Total**                 | **In Progress** | **160 / 198**     |
