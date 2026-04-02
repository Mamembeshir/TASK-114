# Meridian Offline Commerce & Compliance Portal — Project Rules

## Before Any Task

Always read these files in order before starting any work:

1. `SPEC.md` — full project specification
2. `questions.md` — open questions and clarifications
3. `CLAUDE.md` — this file (project rules)
4. `PLAN.md` — current implementation plan and progress

---

## Tech Stack (Strict — No Deviations)

| Layer        | Technology                                  |
| ------------ | ------------------------------------------- |
| UI Framework | React 19 + TypeScript                       |
| Build Tool   | Vite                                        |
| Styling      | Tailwind CSS + premium modern UI components |
| Persistence  | IndexedDB via Dexie.js (main data)          |
| Preferences  | LocalStorage                                |
| Global State | Zustand or Jotai                            |
| Icons        | Lucide React                                |

---

## Strict Project Rules

### Offline-First

- 100% offline, pure frontend application — no network calls, no CDN dependencies at runtime
- All assets, fonts, and libraries must be bundled at build time

### Task Discipline

- Do ONLY ONE small, focused task per response
- After finishing each task: update `PLAN.md` and commit with a clear, descriptive message

### UI/UX Standards

- Premium, clean, professional enterprise UI (modern dashboard style)
- Excellent UX for auctions and documents
- Every interaction must have loading states, error handling, and toast notifications
- Responsive layout; left navigation Drawer + tabbed main area as per SPEC

### TypeScript

- Strong TypeScript usage throughout — proper types, interfaces, and enums for all domain models
- No `any` types unless absolutely unavoidable and explicitly commented

### Security

- PBKDF2 password hashing for all local credentials
- Web Crypto API encryption for sensitive data at rest
- Append-only audit logs for all state-changing operations (bids, approvals, document actions, role changes)

---

## Resolved Design Decisions

### 1. Auction — No-Bid Scenario

Mark auction as **"No Sale / Expired"**. Notify seller (Admin/Content Editor). Return inventory to available stock.

### 2. Deposit / Credit Wallet Deduction Timing

Deduct deposit **only on win**. During active bidding, hold a "reserved" amount without fully deducting.

### 3. Proxy Bidding Execution

Deterministic proxy bidding engine. Process bids in **timestamp + bid amount** order, respecting minimum increment rules and anti-sniping logic.

### 4. Anti-Sniping Auto-Extension

Extend by **2 minutes, once per auction**, when a bid is placed in the final 30-second window. No further extensions after that.

### 5. Document Checkout & Concurrent Editing

**Exclusive checkout (document locking).** Only one user may check out a document at a time. Others see a locked indicator with the current editor's name.

### 6. Document Numbering Format

Generate the final document number (e.g., `ORG-2026-000123`) **only when the document moves from Draft → Approved**, to avoid numbering gaps from rejections.

### 7. Retention Policy & Destruction Approval

Destruction after retention period requires **two-step approval**: Reviewer + Administrator, with mandatory audit trail entry and stated reason.

### 8. Sensitive Word Moderation Scope

Run moderation **on save and on submit for review**. Block publishing until all flagged issues are resolved.

### 9. Readership Analytics (Offline)

Track local view events and time-on-page per user session. Aggregate analytics per session. Export statistics via admin data export (CSV/JSON).

### 10. Cross-Tab Bidding Consistency

Use **BroadcastChannel + IndexedDB transaction locks + idempotency keys** to prevent duplicate bids across multiple tabs for the same user.

### 11. Outbound Notification Queue

Maintain an outbound queue table in IndexedDB. Export as **CSV/JSON** for manual processing via official channels (no real SMS/email).

### 12. Role Hierarchy & Permissions

Use **explicit role-based permission matrix** — no implicit inheritance. Each role has a clearly defined set of permissions documented in the codebase.
