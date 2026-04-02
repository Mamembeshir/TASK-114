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

- [ ] Build `AppShell` layout with left Drawer + main content area
- [ ] Make Drawer collapsible with smooth CSS transition
- [ ] Persist Drawer open/closed state to LocalStorage

### 2.2 Navigation Drawer

- [ ] Build `NavDrawer` component with role-aware navigation items
- [ ] Add navigation sections: Auctions, Catalog, Publishing, Documents, Messages, Admin
- [ ] Show/hide nav items based on current user's role and permissions
- [ ] Add user avatar, name, and role badge at the bottom of the Drawer
- [ ] Add logout button in Drawer footer

### 2.3 Tabbed Workspace

- [ ] Build `TabBar` component supporting multiple open tabs
- [ ] Implement tab open, close, and switch actions in `TabStore`
- [ ] Support middle-click to close tabs
- [ ] Preserve tab state across navigation (unsaved form warning on close)
- [ ] Add keyboard shortcut support: Ctrl+W to close active tab

### 2.4 Global UI Primitives

- [ ] Build `Button` component (variants: primary, secondary, ghost, danger)
- [ ] Build `Input`, `Textarea`, `Select`, `Checkbox` form components
- [ ] Build `Modal` / `Dialog` component
- [ ] Build `Badge` component (for statuses, roles)
- [ ] Build `Card` component
- [ ] Build `Table` component with sortable columns and pagination
- [ ] Build `EmptyState` component
- [ ] Build `Spinner` / `Skeleton` loading components
- [ ] Configure global toast notifications (top-right, auto-dismiss)

### 2.5 Dashboard / Home

- [ ] Build `DashboardPage` as the landing view after login
- [ ] Show role-specific summary widgets (active auctions, pending approvals, unread messages)
- [ ] Add quick-action buttons relevant to the user's role

---

## Phase 3: Auction System & Bidding Engine

### 3.1 Data Models

- [ ] Define `Auction`, `Bid`, `ProxyBid`, `Wallet`, `WalletTransaction` TypeScript interfaces
- [ ] Add Dexie tables and indexes for all auction-related models

### 3.2 Auction CRUD (Admin / Content Editor)

- [ ] Build `CreateAuctionForm` with fields: title, description, start price, minimum increment, deposit amount, start time, end time, images
- [ ] Build `AuctionListPage` with filterable/sortable table (status, date, category)
- [ ] Build `AuctionDetailPage` for viewing full auction info
- [ ] Implement edit and soft-delete for auctions in Draft status
- [ ] Add audit log entries for auction create, edit, publish, cancel

### 3.3 Bidding Engine (Core Logic)

- [ ] Implement `placeBid(auctionId, userId, amount)` with IndexedDB transaction lock
- [ ] Enforce minimum increment validation in `placeBid`
- [ ] Implement proxy bid engine: `setProxyBid(auctionId, userId, maxAmount)`
- [ ] Implement deterministic proxy resolution (timestamp + amount order)
- [ ] Implement anti-sniping: detect bid in final 30s, extend end time by 2 minutes once
- [ ] Implement idempotency key on each bid to prevent cross-tab duplicates
- [ ] Broadcast bid updates to other tabs via BroadcastChannel
- [ ] Write audit log entry for every bid placed

### 3.4 Deposit Wallet

- [ ] Build `WalletService`: credit, debit, reserve, release functions
- [ ] Deduct deposit only on auction win; hold reserved amount during active bidding
- [ ] Build `WalletPage` showing balance, reserved amount, and transaction history
- [ ] Admin can credit/debit participant wallets manually

### 3.5 Auction Lifecycle

- [ ] Implement auction status machine: `Draft → Active → Extended → Ended → Awarded | NoSale`
- [ ] Implement `closeAuction()` — determine winner, deduct deposit, notify participants
- [ ] Handle no-bid scenario: mark as `NoSale`, release any holds, notify seller
- [ ] Build scheduled auction timer using `setInterval` + BroadcastChannel sync

### 3.6 Participant Auction UI

- [ ] Build `AuctionBrowsePage` with live bid display and countdown timer
- [ ] Build `BidForm` with current price, minimum next bid, and proxy bid input
- [ ] Show real-time bid history table
- [ ] Highlight winning bid; show "You are winning" / "You were outbid" states
- [ ] Show anti-sniping extension notice when triggered
- [ ] Build `MyBidsPage` listing all auctions the participant has bid on

---

## Phase 4: Catalog & Search

### 4.1 Data Models

- [ ] Define `CatalogItem`, `Category`, `Tag`, `ModerationFlag` TypeScript interfaces
- [ ] Add Dexie tables and indexes (full-text search fields, category, status)

### 4.2 Catalog Item CRUD (Content Editor)

- [ ] Build `CreateCatalogItemForm`: title, description, category, tags, price, images, stock
- [ ] Build `CatalogManagementPage` with filterable item table
- [ ] Implement edit, archive, and restore for catalog items
- [ ] Add audit log entries for item create, edit, publish, archive

### 4.3 Advanced Search

- [ ] Implement client-side full-text search across title, description, and tags using Dexie
- [ ] Build `SearchBar` with debounced input
- [ ] Build faceted filter panel: category, price range, status, tags
- [ ] Implement sort options: relevance, price asc/desc, newest
- [ ] Build `SearchResultsPage` with pagination

### 4.4 Content Moderation

- [ ] Build sensitive-word list management (Admin configures list)
- [ ] Implement `moderateContent(text)` utility that scans against sensitive-word list
- [ ] Run moderation on save and on submit for review
- [ ] Show inline moderation warnings in editor UI
- [ ] Block publish action until all moderation flags are resolved
- [ ] Add `ModerationQueuePage` for Reviewer role

---

## Phase 5: Publishing Workbench

### 5.1 Data Models

- [ ] Define `Publication`, `PublicationVersion`, `ApprovalWorkflow`, `WorkflowStep` interfaces
- [ ] Add Dexie tables with version history support

### 5.2 Content Authoring (Content Editor)

- [ ] Build rich-text editor component (use a bundled library, e.g., TipTap or Quill)
- [ ] Build `CreatePublicationForm`: title, type (announcement / notice / bulletin), body, attachments
- [ ] Auto-save draft to IndexedDB every 30 seconds
- [ ] Show "Last saved" timestamp in editor toolbar

### 5.3 Approval Workflow

- [ ] Implement workflow state machine: `Draft → InReview → Approved | Rejected → Published`
- [ ] Build `SubmitForReviewAction` (Content Editor)
- [ ] Build `ReviewQueuePage` listing pending submissions (Reviewer/Approver)
- [ ] Build `ReviewDetailPage` with approve/reject action and comment field
- [ ] Notify author on approval or rejection via Message Center
- [ ] Run sensitive-word moderation on submit for review

### 5.4 Version Control & Rollback

- [ ] Save a new `PublicationVersion` snapshot on every submit-for-review
- [ ] Build `VersionHistoryPanel` showing all versions with timestamp and author
- [ ] Implement `rollbackToVersion(versionId)` — restore content, create new draft version
- [ ] Add audit log entry for every version save and rollback

### 5.5 Publishing & Readership

- [ ] Implement `publishPublication()` — set status to Published, record publish timestamp
- [ ] Build `PublicationFeedPage` for Participants: list of published announcements
- [ ] Record a view event (userId, publicationId, timestamp) on open
- [ ] Track time-on-page via visibility API; store in IndexedDB on tab close/navigate away
- [ ] Build `Readership Analytics Panel` (Admin/Reviewer): unique readers, avg time-on-page per publication

---

## Phase 6: Document & Archive Module

### 6.1 Data Models

- [ ] Define `Document`, `DocumentVersion`, `CheckoutRecord`, `RetentionPolicy` interfaces
- [ ] Add Dexie tables with checkout lock and numbering support

### 6.2 Document CRUD & Numbering

- [ ] Build `CreateDocumentForm`: title, type, category, body/attachment, retention period
- [ ] Implement draft document with temporary ID; assign final `ORG-YYYY-NNNNNN` number only on approval
- [ ] Build `DocumentListPage` with filterable table (status, category, number, date)

### 6.3 Checkout & Locking

- [ ] Implement `checkoutDocument(docId, userId)` — write `CheckoutRecord`, block others
- [ ] Implement `checkinDocument(docId, userId)` — release lock, save new version
- [ ] Show lock indicator with editor name on document detail for other users
- [ ] Auto-release checkout if user session ends without check-in (configurable timeout)

### 6.4 Watermarking

- [ ] Implement `generateWatermark(userId, docId, timestamp)` — produce visible watermark string
- [ ] Overlay watermark on document view (canvas or CSS overlay)
- [ ] Include watermark in exported/printed PDF representation

### 6.5 Approval Workflow (Documents)

- [ ] Reuse workflow state machine from Phase 5 for documents
- [ ] Assign document number on transition to Approved
- [ ] Build `DocumentApprovalQueuePage` for Reviewer role

### 6.6 Retention Policy & Destruction

- [ ] Admin configures retention periods per document category
- [ ] Flag documents as `RetentionDue` when retention date is reached
- [ ] Build `RetentionQueuePage` listing documents due for destruction review
- [ ] Implement two-step destruction approval (Reviewer submits → Administrator confirms)
- [ ] Record destruction event in append-only audit log with reason and approver names

### 6.7 Archive & Search

- [ ] Implement archive status for approved + past-retention documents
- [ ] Full-text search within document archive (title, number, category, body excerpt)

---

## Phase 7: Message Center & Notifications

### 7.1 Data Models

- [ ] Define `Notification`, `OutboundQueueItem`, `MessageThread` interfaces
- [ ] Add Dexie tables with read/unread tracking

### 7.2 In-App Notifications

- [ ] Implement `NotificationService`: create, mark-read, mark-all-read, delete
- [ ] Build `NotificationBell` in app header with unread badge count
- [ ] Build `NotificationDropdown` with list of recent notifications
- [ ] Build `NotificationCenterPage` with full notification history and filters
- [ ] Broadcast new notifications to other tabs via BroadcastChannel

### 7.3 Outbound Queue

- [ ] Build `OutboundQueuePage` (Admin) listing all queued outbound messages
- [ ] Support message types: Email, SMS (offline queue only — no actual send)
- [ ] Implement export to CSV and JSON for manual processing
- [ ] Implement bulk actions: mark-as-sent, delete, re-queue

### 7.4 System-Triggered Notifications

- [ ] Notify bid authors when outbid
- [ ] Notify auction winner on auction close
- [ ] Notify seller when auction ends with no sale
- [ ] Notify publication author on review approval/rejection
- [ ] Notify document checkout owner when auto-release is approaching
- [ ] Notify all users when a new publication is published
- [ ] Notify Admin when a document enters retention queue

---

## Phase 8: Admin Features & Export/Import

### 8.1 User Management

- [ ] Build `UserManagementPage`: list, create, edit, deactivate users
- [ ] Build `CreateUserForm` with role assignment
- [ ] Implement password reset by Administrator (generates temporary password)
- [ ] Add audit log entry for every user create, edit, role change, deactivate

### 8.2 System Configuration

- [ ] Build `SystemSettingsPage`: org name, logo, document numbering prefix, retention defaults
- [ ] Build `SensitiveWordListEditor`: add, edit, remove flagged words/phrases
- [ ] Build `AuctionRulesConfig`: default minimum increment, anti-sniping window, extension duration

### 8.3 Audit Log Viewer

- [ ] Build `AuditLogPage` (Admin only): full append-only event log with filters
- [ ] Filter by: user, event type, date range, entity type
- [ ] Export audit log to CSV

### 8.4 Data Export & Import

- [ ] Implement full database export to JSON (all tables, all records)
- [ ] Implement selective export: per-module (auctions, documents, publications, users)
- [ ] Implement data import from JSON with conflict detection and merge strategy
- [ ] Add progress indicator and error reporting during import
- [ ] Include readership analytics in export

### 8.5 Wallet Management (Admin)

- [ ] Build `WalletManagementPage`: view all participant wallets and balances
- [ ] Implement manual credit and debit with required reason (audit logged)

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

- [ ] Lazy-load all page-level components with `React.lazy` + `Suspense`
- [ ] Implement virtual scrolling for long tables (auction bids, audit log, document list)
- [ ] Profile IndexedDB query performance; add missing indexes if needed
- [ ] Debounce all search inputs and live-filter interactions
- [ ] Memoize expensive computed values with `useMemo` and `useCallback`

### 9.3 Offline Robustness

- [ ] Register a Service Worker to cache the app shell and all static assets
- [ ] Test full reload and navigation in DevTools offline mode
- [ ] Verify BroadcastChannel sync works correctly across 3+ tabs
- [ ] Validate IndexedDB transaction isolation under concurrent bid simulation

### 9.4 Security Hardening

- [ ] Audit all user inputs for XSS vectors; sanitize rich-text content before storage and display
- [ ] Verify PBKDF2 iterations meet current recommendations (≥ 310,000)
- [ ] Confirm all sensitive IndexedDB fields are encrypted at rest
- [ ] Ensure audit log table has no delete or update path in application code

### 9.5 Testing

- [ ] Write unit tests for bidding engine (proxy bid resolution, anti-sniping, duplicate prevention)
- [ ] Write unit tests for PBKDF2 and Web Crypto utilities
- [ ] Write unit tests for moderation engine
- [ ] Write unit tests for document numbering and retention date calculation
- [ ] Write integration tests for auction lifecycle (Draft → Active → Ended → Awarded)
- [ ] Write integration tests for publication approval workflow
- [ ] Write integration tests for document checkout/check-in locking
- [ ] Manual smoke test: all four roles through their primary workflows

### 9.6 Documentation

- [ ] Document folder structure and module responsibilities in `README.md`
- [ ] Document IndexedDB schema (tables, indexes, relationships)
- [ ] Document permission matrix in `docs/permissions.md`
- [ ] Document export/import JSON schema

---

## Progress Summary

| Phase                     | Status          | Completed / Total |
| ------------------------- | --------------- | ----------------- |
| Phase 1: Setup & Auth     | In Progress     | 15 / 27           |
| Phase 2: Layout & Shell   | Pending         | 0 / 22            |
| Phase 3: Auction System   | Pending         | 0 / 28            |
| Phase 4: Catalog & Search | Pending         | 0 / 18            |
| Phase 5: Publishing       | Pending         | 0 / 21            |
| Phase 6: Documents        | Pending         | 0 / 22            |
| Phase 7: Messages         | Pending         | 0 / 18            |
| Phase 8: Admin & Export   | Pending         | 0 / 19            |
| Phase 9: Polish & Testing | Pending         | 0 / 23            |
| **Total**                 | **In Progress** | **15 / 198**      |
