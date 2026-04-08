# Meridian Portal — API Specification

## Document conventions

This project is a **pure client application**. There is **no HTTP API** exposed by the Meridian Portal for business operations. All “APIs” documented here are:

1. **TypeScript service APIs** — async functions and modules UI and tests call.
2. **Storage API** — IndexedDB schema exposed through Dexie (`MeridianDB`).
3. **Inter-tab messaging** — `BroadcastChannel` events for auction/bid consistency.

Paths refer to the **`repo/`** package root.

---

## 1. Service layer (application API)

### 1.1 Auctions — `src/services/auctionService.ts`

| Function | Description |
|----------|-------------|
| `createAuction(...)` | Create auction record (draft). |
| `updateAuction(...)` | Update auction fields. |
| `publishAuction(...)` | Transition to published/live state per rules. |
| `cancelAuction(id, actorId, actorName)` | Cancel auction; audit. |
| `getAuction(id)` | Load by id. |
| `listAuctions(filters?)` | List with optional filters. |

### 1.2 Bidding — `src/services/biddingEngine.ts`

| Function | Description |
|----------|-------------|
| `placeBid(...)` | Place bid with validation, proxy resolution, anti-sniping side effects, idempotency. |
| `setProxyBid(...)` | Set or update maximum proxy bid for participant. |

### 1.3 Auction lifecycle — `src/services/auctionLifecycle.ts`

| Function | Description |
|----------|-------------|
| `closeAuction(auction)` | Close auction, determine outcome, wallet/inventory side effects. |
| `startAuctionLifecycleTimer()` | Returns teardown function; drives scheduled closes in-browser. |

### 1.4 Wallet — `src/services/walletService.ts`

| Function | Description |
|----------|-------------|
| `ensureWallet(userId)` | Create wallet row if missing. |
| `creditWallet(...)` | Add funds / credit line. |
| `debitWallet(...)` | Debit with reason and linkage (e.g. auction). |
| `reserveForAuction(...)` | Reserve amount for active bidding. |
| `releaseReservation(...)` | Release unused reservation. |
| `deductDeposit(...)` | Apply deposit deduction (e.g. on win). |

### 1.5 Cross-tab bid events — `src/services/bidChannel.ts`

| Export | Description |
|--------|-------------|
| `broadcast(event)` | Post `BidEvent` to channel `meridian_bids`. |
| `subscribeToBidEvents(handler)` | Subscribe; returns unsubscribe. |

**`BidEvent` union:**

- `{ type: 'BID_PLACED'; auctionId; bid; newPrice }`
- `{ type: 'AUCTION_EXTENDED'; auctionId; newEndTime }`
- `{ type: 'AUCTION_CLOSED'; auctionId }`

### 1.6 Catalog — `src/services/catalogService.ts`

| Function | Description |
|----------|-------------|
| `createCatalogItem(...)` | Create item (draft/moderation path). |
| `updateCatalogItem(...)` | Update fields; may trigger moderation checks. |
| `publishCatalogItem(...)` | Publish visible item. |
| `archiveCatalogItem(...)` | Soft-archive / withdraw from active catalog. |
| `restoreCatalogItem(...)` | Restore from archived state. |

### 1.7 Publications — `src/services/publicationService.ts`

| Function | Description |
|----------|-------------|
| `createPublication(...)` | New publication. |
| `updatePublication(...)` | Edit draft/content. |
| `submitForReview(...)` | Move into review; sensitive-word checks. |
| `approvePublication(...)` | Approver accept. |
| `rejectPublication(...)` | Reject with feedback. |
| `publishPublication(...)` | Go live / visible per rules. |
| `rollbackToVersion(...)` | Restore prior version. |

### 1.8 Documents — `src/services/documentService.ts`

| Function | Description |
|----------|-------------|
| `generateWatermark(userId, displayName)` | Deterministic watermark string for display/export. |
| `createDocument(...)` | New document. |
| `updateDocument(...)` | Save draft changes. |
| `checkoutDocument(...)` | Exclusive lock. |
| `checkinDocument(...)` | Release after edit. |
| `releaseCheckout(...)` | Admin/forced release if applicable. |
| `submitDocumentForReview(...)` | Workflow forward. |
| `approveDocument(...)` | Assign document number on first approval from draft. |
| `rejectDocument(...)` | Return to author. |
| `requestDestruction(...)` | Start destruction workflow. |
| `reviewerApproveDestruction(...)` | First approval step. |
| `adminApproveDestruction(...)` | Second approval step. |
| `rejectDestruction(...)` | Cancel destruction request. |

### 1.9 Notifications & outbound queue — `src/services/notificationService.ts`

| Function | Description |
|----------|-------------|
| `createNotification(input)` | Single user notification. |
| `createNotificationForMany(...)` | Bulk create. |
| `markNotificationRead(id)` | Mark one read. |
| `markAllNotificationsRead(userId)` | Mark all for user. |
| `deleteNotification(id)` | Remove notification. |
| `getUnreadCount(userId)` | Badge count. |
| `queueOutboundMessage(input)` | Enqueue CSV/JSON-exportable outbound item. |
| `markOutboundSent(id)` | Manual processing complete. |
| `markOutboundFailed(id)` | Processing failed. |
| `requeueOutbound(id)` | Retry queue. |
| `deleteOutboundItem(id)` | Remove queue row. |
| `bulkMarkOutboundSent(ids)` | Batch mark sent. |
| `bulkDeleteOutbound(ids)` | Batch delete. |
| `notify(...)` | Higher-level helper for common notification patterns. |

---

## 2. Storage API (IndexedDB / Dexie)

**Database name:** `MeridianPortal`  
**Class:** `MeridianDB` — `src/db/database.ts`

### 2.1 Tables and indexes (schema v1)

| Table | Indexed fields (Dexie schema) |
|-------|-------------------------------|
| `users` | `id`, `&username`, `role`, `isActive`, `createdAt` |
| `sessions` | `id`, `userId`, `expiresAt` |
| `auditLogs` | `id`, `eventType`, `actorId`, `entityType`, `entityId`, `createdAt` |
| `auctions` | `id`, `status`, `categoryId`, `createdBy`, `startTime`, `endTime`, `createdAt` |
| `bids` | `id`, `auctionId`, `bidderId`, `&idempotencyKey`, `createdAt` |
| `proxyBids` | `id`, `auctionId`, `bidderId`, `isActive` |
| `wallets` | `id`, `&userId` |
| `walletTransactions` | `id`, `walletId`, `userId`, `type`, `relatedAuctionId`, `createdAt` |
| `catalogItems` | `id`, `status`, `categoryId`, `*tags`, `createdBy`, `createdAt` |
| `categories` | `id`, `parentId` |
| `tags` | `id`, `&name` |
| `publications` | `id`, `type`, `status`, `createdBy`, `createdAt`, `publishedAt` |
| `publicationVersions` | `id`, `publicationId`, `versionNumber`, `createdAt` |
| `viewEvents` | `id`, `[entityType+entityId]`, `userId`, `openedAt` |
| `documents` | `id`, `documentNumber`, `status`, `categoryId`, `checkedOutBy`, `retentionDueDate`, `createdBy`, `createdAt` |
| `documentVersions` | `id`, `documentId`, `versionNumber`, `createdAt` |
| `checkoutRecords` | `id`, `documentId`, `userId`, `isActive`, `checkedOutAt` |
| `retentionPolicies` | `id`, `&categoryId` |
| `destructionApprovals` | `id`, `documentId`, `status`, `requestedBy`, `requestedAt` |
| `notifications` | `id`, `userId`, `type`, `isRead`, `createdAt` |
| `outboundQueue` | `id`, `recipientUserId`, `status`, `channel`, `queuedAt` |
| `systemConfig` | `id` |
| `sensitiveWords` | `id`, `&word`, `createdAt` |

**Dexie index notation:** `&field` = unique; `[a+b]` = compound; `*field` = multi-entry.

### 2.2 Type definitions

Domain record shapes live under `src/types/` (e.g. `auth`, `auction`, `catalog`, `document`, `publication`, `notification`, `system`, `audit`). Services and UI should import these types rather than duplicating shapes.

---

## 3. UI routing contract (in-app)

Tab content resolves paths to pages (lazy components). Representative routes:

| Path pattern | Screen |
|--------------|--------|
| `/` | Dashboard |
| `/auctions`, `/auctions/new`, `/auctions/:id`, `/auctions/:id/edit`, `/auctions/browse`, `/auctions/my-bids`, `/auctions/wallet` | Auction flows |
| `/catalog`, `/catalog/new`, `/catalog/:id/edit`, `/catalog/browse`, `/catalog/moderation` | Catalog |
| `/publishing`, `/publishing/new`, `/publishing/:id/edit`, `/publishing/:id/review`, `/publishing/queue`, `/publishing/feed` | Publishing |
| `/documents`, `/documents/new`, `/documents/:id`, `/documents/:id/edit`, `/documents/:id/review` | Documents |
| `/notifications`, `/outbound-queue` | Messaging |
| `/admin/users`, `/admin/settings`, `/admin/sensitive-words`, `/admin/audit-log`, `/admin/export` | Admin |

Exact matching order is implemented in `src/components/layout/TabContent.tsx`.

---

## 4. Permissions

Role-to-permission mapping is defined in `src/auth/permissions.ts`. UI gates use `usePermission` (`src/hooks/usePermission.ts`) against that matrix. Extending the “API” for new features requires adding permissions here and enforcing them in services or pages as appropriate.

---

## 5. Error and concurrency expectations

- Service functions throw or return rejected promises on rule violations; callers should surface user-visible errors (toasts) and avoid partial UI updates without refresh from DB.
- Bid placement relies on **unique `idempotencyKey`** in `bids` and transactional writes to prevent duplicates.
- Document checkout uses `checkoutRecords` and document `checkedOutBy` fields for exclusivity.

---

*For product intent and resolved product decisions, see `design.md` and `SPEC.md`.*
