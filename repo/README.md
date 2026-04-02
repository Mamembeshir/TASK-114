# Meridian Offline Commerce & Compliance Portal

A 100% offline, browser-based enterprise portal for internal auctions, controlled document management, and regulated communications. Built with React 19 + TypeScript + Vite + Tailwind CSS + IndexedDB (Dexie.js). No internet connection required at runtime.

---

## How to Run

### Option A — Local Node.js (no Docker required)

**Prerequisites:** Node.js ≥ 20 and [pnpm](https://pnpm.io/installation) ≥ 9.

```bash
# Install dependencies
pnpm install

# Development server with hot-reload (http://localhost:5173)
pnpm dev

# Production build
pnpm build

# Serve the production build locally (http://localhost:4173)
pnpm preview

# Run the test suite once
pnpm test

# Run with coverage report
pnpm test --coverage
```

---

### Option B — Docker (no local Node/pnpm required)

#### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/) ≥ 2.20 (bundled with Docker Desktop)

### One-Click Start (Production Preview)

```bash
docker compose up
```

That is the only command needed. Docker will:

1. Pull the `node:22-alpine` base image
2. Install all dependencies via `pnpm` (no local Node/pnpm required)
3. Build the static SPA with Vite
4. Serve it on port **4173**

### Development Mode (Hot-Reload)

```bash
docker compose --profile dev up dev
```

Source files are volume-mounted; Vite HMR updates the browser instantly on save.

### Stop All Services

```bash
docker compose down
```

---

## Services List

| Service | Profile     | URL                   | Description              |
| ------- | ----------- | --------------------- | ------------------------ |
| `app`   | _(default)_ | http://localhost:4173 | Production preview build |
| `dev`   | `dev`       | http://localhost:5173 | Vite dev server with HMR |
| `test`  | `test`      | —                     | Vitest CI test runner    |

---

## Verification

After `docker compose up`, verify the portal is running:

**Browser**

```
Open http://localhost:4173
```

You should see the Meridian Portal landing screen.

**curl / wget**

```bash
curl -I http://localhost:4173
# Expected: HTTP/1.1 200 OK
```

**Docker health check**

```bash
docker inspect --format='{{.State.Health.Status}}' meridian-app
# Expected: healthy  (after ~30 seconds)
```

**Compose status**

```bash
docker compose ps
# Expected: meridian-app  running  0.0.0.0:4173->4173/tcp
```

---

## Running Tests

### Using the CI script (recommended)

```bash
# Run all tests once
./run_tests.sh

# Run with coverage report
./run_tests.sh --coverage

# Clean rebuild before running
./run_tests.sh --clean

# Watch mode (development)
./run_tests.sh --watch
```

Coverage HTML report is written to `./coverage/index.html` on the host.

### Using Docker Compose directly

```bash
docker compose --profile test up --exit-code-from test test
```

### CI Pipeline Example

```yaml
# GitHub Actions
- name: Run tests
  run: ./run_tests.sh --coverage
```

---

## Tech Stack

| Layer             | Technology               |
| ----------------- | ------------------------ |
| UI Framework      | React 19 + TypeScript    |
| Build Tool        | Vite 6                   |
| Styling           | Tailwind CSS 3           |
| Persistence       | IndexedDB via Dexie.js 4 |
| Global State      | Zustand 5                |
| Icons             | Lucide React             |
| Notifications     | Sonner                   |
| Routing           | React Router 7           |
| Testing           | Vitest + Testing Library |
| Package Manager   | pnpm                     |
| Container Runtime | Docker + Docker Compose  |

---

## Project Structure

```
src/
├── auth/
│   └── permissions.ts          # Role-based permission matrix (23 permissions × 4 roles)
├── components/
│   ├── auction/                # BidForm, CountdownTimer
│   ├── auth/                   # ProtectedRoute
│   ├── layout/                 # AppShell, NavDrawer, TabBar, TabContent, NotificationBell
│   └── ui/                     # Design system: Button, Input, Modal, Table, Badge, Card…
├── crypto/
│   ├── encryption.ts           # AES-GCM-256 encrypt/decrypt (Web Crypto API)
│   ├── ids.ts                  # generateId() — crypto.randomUUID()
│   └── password.ts             # PBKDF2-HMAC-SHA-256 (310,000 iterations)
├── db/
│   ├── database.ts             # MeridianDB Dexie class — 22 tables + indexes
│   ├── index.ts                # Singleton db export
│   └── seeds.ts                # Default admin + categories seeded on first launch
├── hooks/
│   └── usePermission.ts        # usePermission(permission) hook for guarded UI
├── pages/
│   ├── admin/                  # UserManagement, SystemSettings, SensitiveWords, AuditLog, DataExport
│   ├── auction/                # AuctionList/Form/Detail, Browse, MyBids, Wallet
│   ├── catalog/                # CatalogManagement, ItemForm, Browse, ModerationQueue
│   ├── documents/              # DocumentList, Form, Detail
│   ├── notifications/          # NotificationCenter, OutboundQueue
│   └── publishing/             # PublicationList/Form, ReviewQueue, ReviewDetail, Feed
├── services/
│   ├── auctionLifecycle.ts     # closeAuction(), startAuctionLifecycleTimer()
│   ├── auctionService.ts       # Auction CRUD, publish, cancel
│   ├── bidChannel.ts           # BroadcastChannel('meridian_bids') singleton
│   ├── biddingEngine.ts        # placeBid(), setProxyBid() with proxy resolution + anti-sniping
│   ├── catalogService.ts       # Catalog item CRUD + moderation + publish
│   ├── documentService.ts      # Document lifecycle: create→checkout→review→approve→destroy
│   ├── notificationService.ts  # createNotification(), queueOutboundMessage(), bulk ops
│   ├── publicationService.ts   # Publication lifecycle: draft→review→approve→publish
│   └── walletService.ts        # credit, debit, reserve, release, deductDeposit
├── store/
│   ├── authStore.ts            # Zustand: login, logout, session restore
│   ├── notificationStore.ts    # Zustand: notifications + BroadcastChannel sync
│   └── tabStore.ts             # Zustand: tab open/close/activate/dirty tracking
├── test/
│   ├── crypto/                 # Unit tests: password, encryption, ids
│   ├── services/               # Integration tests: biddingEngine, lifecycle, workflow, checkout
│   └── utils/                  # Unit tests: moderation
├── types/
│   ├── auction.ts              # Auction, Bid, ProxyBid, Wallet, WalletTransaction
│   ├── audit.ts                # AuditLog, AuditEventType (60+ event types)
│   ├── auth.ts                 # User, Session, Role enum
│   ├── catalog.ts              # CatalogItem, Category, Tag
│   ├── document.ts             # Document, DocumentVersion, CheckoutRecord, RetentionPolicy, DestructionApproval
│   ├── notification.ts         # Notification, OutboundQueueItem, NotificationType
│   ├── publication.ts          # Publication, PublicationVersion, ViewEvent
│   ├── system.ts               # SystemConfig, SensitiveWord
│   └── index.ts                # Central re-export barrel
└── utils/
    ├── audit.ts                # writeAuditLog() — append-only, never updates or deletes
    ├── moderation.ts           # moderateContent() — whole-word regex against sensitiveWords table
    └── sanitize.ts             # sanitizeHtml() — DOMPurify wrapper for dangerouslySetInnerHTML
```

---

## IndexedDB Schema

All 22 tables are declared in version 1 of the Dexie schema. Prefix `&` = unique index, `*` = multi-entry index.

| Table                 | Key Indexes                                                  |
| --------------------- | ------------------------------------------------------------ |
| `users`               | `&username`, `role`, `isActive`                              |
| `sessions`            | `userId`, `expiresAt`                                        |
| `auditLogs`           | `actorId`, `entityType`, `entityId`, `createdAt`             |
| `auctions`            | `status`, `createdBy`, `endTime`, `[status+endTime]`         |
| `bids`                | `auctionId`, `bidderId`, `&idempotencyKey`, `createdAt`      |
| `proxyBids`           | `auctionId`, `bidderId`, `isActive`, `[auctionId+isActive]`  |
| `wallets`             | `userId`                                                     |
| `walletTransactions`  | `walletId`, `userId`, `type`, `relatedAuctionId`             |
| `catalogItems`        | `status`, `categoryId`, `*tags`, `createdBy`                 |
| `categories`          | `&slug`, `parentId`                                          |
| `tags`                | `&slug`                                                      |
| `publications`        | `status`, `createdBy`, `publishedAt`                         |
| `publicationVersions` | `publicationId`, `createdAt`                                 |
| `viewEvents`          | `entityId`, `userId`, `openedAt`                             |
| `documents`           | `status`, `documentNumber`, `categoryId`, `createdBy`, `retentionDueDate` |
| `documentVersions`    | `documentId`, `createdAt`                                    |
| `checkoutRecords`     | `documentId`, `userId`, `isActive`                           |
| `retentionPolicies`   | `documentType`                                               |
| `destructionApprovals`| `documentId`, `status`                                       |
| `notifications`       | `userId`, `isRead`, `createdAt`                              |
| `outboundQueue`       | `status`, `recipientType`, `createdAt`                       |
| `sensitiveWords`      | `&word`                                                      |

---

## Permission Matrix

| Permission          | Admin | Editor | Reviewer | Participant |
| ------------------- | :---: | :----: | :------: | :---------: |
| manageUsers         |  ✓   |        |          |             |
| manageSystem        |  ✓   |        |          |             |
| manageWallets       |  ✓   |        |          |             |
| viewAuditLog        |  ✓   |        |   ✓      |             |
| exportData          |  ✓   |        |          |             |
| createAuction       |  ✓   |   ✓    |          |             |
| editAuction         |  ✓   |   ✓    |          |             |
| publishAuction      |  ✓   |   ✓    |          |             |
| placeBid            |  ✓   |        |          |   ✓         |
| createCatalogItem   |  ✓   |   ✓    |          |             |
| editCatalogItem     |  ✓   |   ✓    |          |             |
| publishCatalogItem  |  ✓   |   ✓    |          |             |
| moderateCatalog     |  ✓   |        |   ✓      |             |
| createPublication   |  ✓   |   ✓    |          |             |
| editPublication     |  ✓   |   ✓    |          |             |
| approvePublication  |  ✓   |        |   ✓      |             |
| publishPublication  |  ✓   |        |   ✓      |             |
| createDocument      |  ✓   |   ✓    |          |             |
| editDocument        |  ✓   |   ✓    |          |             |
| approveDocument     |  ✓   |        |   ✓      |             |
| requestDestruction  |  ✓   |   ✓    |   ✓      |             |
| approveDestruction  |  ✓   |        |   ✓      |             |
| manageNotifications |  ✓   |        |          |             |

Full implementation: `src/auth/permissions.ts`

---

## Security

| Concern         | Implementation                                                      |
| --------------- | ------------------------------------------------------------------- |
| Passwords       | PBKDF2-HMAC-SHA-256, 310,000 iterations, 16-byte salt, 256-bit key  |
| Session tokens  | AES-GCM-256 encrypted in LocalStorage; per-device master key        |
| Rich text XSS   | DOMPurify sanitization before every `dangerouslySetInnerHTML` call  |
| Audit log       | Append-only — zero delete/update code paths exist in the codebase   |
| Duplicate bids  | Unique `idempotencyKey` index + Dexie `rw` transaction + BroadcastChannel |
| Moderation      | Sensitive-word scan on every save and submit-for-review             |

---

## Test Coverage

65 tests across 10 test files (Vitest + fake-indexeddb):

| File                            | Tests | What it covers                                              |
| ------------------------------- | :---: | ----------------------------------------------------------- |
| `crypto/password.test.ts`       |   5   | PBKDF2 format, uniqueness, verify, wrong password/salt      |
| `crypto/encryption.test.ts`     |   6   | AES-GCM round-trip, unique IVs, tamper rejection            |
| `crypto/ids.test.ts`            |   2   | UUID format, 100-sample collision check                     |
| `utils/moderation.test.ts`      |   8   | Empty list, case-insensitive, whole-word, multi-text, dedup |
| `services/biddingEngine.test.ts`|  11   | Min increment, state guards, idempotency, anti-sniping, proxy |
| `services/documentNumbering.test.ts` | 4 | No number on Draft, ORG-YYYY-NNNNNN on Approved, sequential, retention date |
| `services/auctionLifecycle.test.ts`  |10 | Draft→Active, Awarded (deposit/release/notifications), NoSale |
| `services/publicationWorkflow.test.ts`|11| Draft→Published workflow, moderation block, notifications   |
| `services/documentCheckout.test.ts`  | 7 | Lock/block/checkin/version snapshot/expired auto-release    |
| `app.test.tsx`                  |   1   | App renders without crashing                                |

---

## Demo Accounts

On first launch the app seeds **three ready-to-use staff accounts**. Buyer (Participant) accounts are created via the self-registration form on the login screen.

| Username   | Password        | Role               | What you can do                                                      |
| ---------- | --------------- | ------------------ | -------------------------------------------------------------------- |
| `admin`    | `adminPass1!`   | Administrator      | Everything: user management, system settings, wallet management, full audit log, data export |
| `editor`   | `editorPass1!`  | Content Editor     | Create & publish auctions, catalog items, publications, and documents |
| `reviewer` | `reviewerPass1!`| ReviewerApprover   | Approve / reject publications and documents; view audit log; approve destruction requests |

### Registering as a Buyer

Click **"New buyer? Create an account"** on the login screen to self-register. Buyer accounts are assigned the **Participant** role and can browse the catalog, place bids, manage their wallet, and read published content.

> Staff accounts are only seeded on first launch (empty database). If you have an existing IndexedDB instance, clear it via DevTools → Application → IndexedDB → Delete database, then refresh.
