# Delivery Acceptance / Project Architecture Inspection

**Subject:** Meridian Offline Commerce & Compliance Portal (frontend in `repo/`)  
**Criteria:** Business / Task Prompt + Acceptance / Scoring Criteria (user-supplied).  
**Excluded:** `./.tmp/` and all subpaths (not read).  
**Code:** Not modified.

---

## 1. Verdict

**Partial Pass**

The deliverable is a credible, structured React + TypeScript SPA with IndexedDB (Dexie), a service layer, documented local run instructions (`pnpm dev` / `pnpm build` / `pnpm test`), and substantial alignment with auctions, catalog, publishing, documents, notifications, crypto, and audit patterns. It does **not** fully satisfy several **explicit** prompt items (Message Center retry/scheduling semantics, participant trainings, parts of catalog search UX, strict anti-sniping wording vs implemented “once per auction” rule, and absence of E2E tests). Runtime execution of the test suite was **not** performed in this review (see boundary).

---

## 2. Scope and Verification Boundary

| Area | Status |
|------|--------|
| **Reviewed** | `repo/README.md`, `repo/package.json`, `repo/src` (App shell, auth, permissions, tab routing, bidding engine, wallet, catalog browse, auction UI, document watermark paths, notification service/types, tests layout per README), `metadata.json` |
| **Excluded** | `./.tmp/` (per instructions) |
| **Not executed** | `pnpm install`, `pnpm test`, `pnpm dev`, `pnpm build` — dependency install/run was not completed in this session |
| **Docker** | Docker-based verification was **not** performed (per instructions). README Option A (Node + pnpm) is documented as non-Docker; that path was assessed statically only. |
| **Unconfirmed** | Whether the project builds and all Vitest tests pass on a clean machine; exact bundle/runtime behavior in browser |

---

## 3. Top Findings

*(Up to 10; ordered by impact on verdict.)*

### 1 — High

- **Conclusion:** Message Center requirements for **scheduled/rule-triggered delivery**, **retry (3 attempts at 1/5/15 minutes)**, **templates**, **read receipts**, and **subscription preferences** are not implemented in the notification domain model or service layer.
- **Rationale:** Prompt treats these as core Message Center capabilities; code provides CRUD-style in-app notifications and a simple outbound queue without retry scheduling or those fields.
- **Evidence:** `OutboundQueueItem` has no retry/attempt/next-run fields (`repo/src/types/notification.ts` L45–58). `notificationService.ts` exposes queue/mark sent/failed/requeue but **no** 1/5/15 minute retry logic (file ends at L145; `grep` for `retry` / `attempt` in that service: no matches).
- **Impact:** Prompt fit and completeness gap in a named primary module.
- **Minimum fix:** Extend schema + worker/timer (or lifecycle hook) for outbound retries; add minimal UI + types for templates, read receipts, and subscription prefs, or document explicit scope reduction.

### 2 — High

- **Conclusion:** **Participant “completes trainings”** (and any training workspace) is **not** present in the reviewed codebase.
- **Rationale:** Prompt lists training completion under Participant responsibilities; no training routes, types, or pages were found.
- **Evidence:** `grep` across `repo/src` for `train|Training` (case-insensitive): no relevant matches.
- **Impact:** Explicit role scenario missing.
- **Minimum fix:** Add a training module (list, progress, completion state in IndexedDB) or formally descope with stakeholder sign-off.

### 3 — High

- **Conclusion:** **Anti-sniping** behavior **differs** from the prompt’s literal reading (“when a valid bid is placed in the last 30 seconds”) vs **one extension per auction** after the first qualifying bid.
- **Rationale:** Strict acceptance uses prompt as source of truth; README/CLAUDE document a product decision for “once.”
- **Evidence:** `repo/src/services/biddingEngine.ts` L171–177: extension only when `!auction.antiSnipingTriggered` and within 30s window; sets `antiSnipingTriggered: true` (L183). README “Anti-sniping rule” section states once-per-auction behavior.
- **Impact:** Functional spec mismatch unless prompt is formally amended.
- **Minimum fix:** Align implementation with prompt (repeat extensions) or update prompt/contract to match `antiSnipingTriggered` semantics.

### 4 — Medium

- **Conclusion:** **Content & Search** prompt items **brand** / **spec** filters, **keyword suggestions from recent searches**, and **trending keywords (7 days)** are missing or only partially reflected in the browse experience.
- **Rationale:** Browse page implements category, price, tags, text search, and sort including `top_sellers`; no recent-search or trending implementation found; brand exists on the type but is not used as a browse facet in the UI reviewed.
- **Evidence:** `CatalogBrowsePage.tsx` facets: category, price, tags (`L129–221`); no brand/spec/trending/recent-search state. `CatalogItem` includes optional `brand` (`repo/src/types/catalog.ts` L9–10). Repository-wide `grep` for `trending|recentSearch` under `src`: no matches.
- **Impact:** Incomplete catalog/search story vs prompt.
- **Minimum fix:** Persist recent searches (LocalStorage), compute 7-day trending from stored events, add brand/spec filters in UI.

### 5 — Medium

- **Conclusion:** **Default deposit** policy (**10% of starting price, minimum $50**) is not enforced or prefilled in the auction authoring UI; deposit is a free numeric field.
- **Rationale:** Prompt describes a default threshold; form validates `>= 0` only.
- **Evidence:** `AuctionFormPage.tsx` L42–43, L84–85: `depositAmount` manual entry; validation `da < 0` only, no `max(50, 0.1*startPrice)` default.
- **Impact:** Operators can publish auctions inconsistent with stated business rules unless they know the policy.
- **Minimum fix:** Compute default on `startPrice` change and optionally allow override with warning.

### 6 — Medium

- **Conclusion:** **Page-level RBAC** is **inconsistent**: admin and some message routes use `PermissionGuard` in `TabContent.tsx`; many feature routes (e.g. `/auctions/new`, `/catalog/...`) render **without** a guard, relying on **service-layer** `requirePermission` and nav visibility.
- **Rationale:** Defense in depth: unauthorized users could still open a tab path (e.g. via devtools/store) and see editor UIs until submit fails.
- **Evidence:** `TabContent.tsx` L185: `/auctions/new` → `<AuctionFormPage />` with no `PermissionGuard`. Compare L302–306: `/admin/users` wrapped in `PermissionGuard`. `requirePermission` in `repo/src/utils/permissions.ts` L20–24 throws on missing permission.
- **Impact:** Weaker page-level access control and UX vs prompt’s RBAC expectations; not necessarily data corruption if all mutations are guarded (auction create uses `createAuction` → `requirePermission('createAuction')` per `auctionService.ts` grep).
- **Minimum fix:** Wrap each route in `PermissionGuard` with the same permission as the service entry point.

### 7 — Medium

- **Conclusion:** **`ProtectedRoute` + `react-router-dom`** are **not integrated** into the running app shell; routing is **tab-path matching** inside `TabContent`, while `main.tsx` mounts `App` without a router.
- **Rationale:** Prompt asks for “client-side routing”; dependency exists but primary navigation is tab-store paths, not URL-synced routes—deep linking and `ProtectedRoute` behavior are effectively unused in production entry.
- **Evidence:** `repo/src/main.tsx` L9–13: no `BrowserRouter`. `grep` for `ProtectedRoute` / `BrowserRouter` in `src`: only `ProtectedRoute.tsx` itself and docs. `App.tsx` switches login vs `AppShell` by auth state.
- **Impact:** Architecture diverges from stated stack; dead or misleading auth route component.
- **Minimum fix:** Adopt router + URL sync for tabs, or remove unused deps and document tab-based routing as the contract.

### 8 — Medium

- **Conclusion:** **E2E tests** (Playwright/Cypress or similar) are **absent**; coverage is **Vitest + Testing Library** only.
- **Rationale:** Acceptance criteria ask whether E2E exists and is runnable.
- **Evidence:** `grep` in `repo` for `playwright|cypress|e2e` in `*.json,*.ts,*.tsx,*.md`: no matches. `package.json` scripts: `vitest run` only.
- **Impact:** Less confidence in full user journeys in a real browser (IndexedDB + BroadcastChannel + multi-tab).
- **Minimum fix:** Add a small Playwright suite for login → bid → catalog browse, or document E2E as out of scope.

### 9 — Low / Medium

- **Conclusion:** **Bid “Results” / history** shows amounts, times, truncated bidder id, and a **(proxy)** flag, but **extension events** are not first-class rows in the timeline (only a banner + auction field).
- **Rationale:** Prompt asked for rule-trigger events (extensions and proxy steps) in the traceable timeline.
- **Evidence:** `AuctionDetailPage.tsx` L149–194: bid list; L95–99: anti-sniping notice separate from bid rows; no per-extension event row tied to timeline.
- **Impact:** Auditability in UI is slightly weaker than specified.
- **Minimum fix:** Append synthetic timeline entries from audit log or engine events for extensions.

### 10 — Low

- **Conclusion:** **`react-router-dom`** is a dependency but **not** used in the main entry path—adds maintenance surface and confusion with README references to “React Router 7.”
- **Rationale:** Engineering clarity.
- **Evidence:** `package.json` L28; `main.tsx` as above.
- **Impact:** Minor maintainability / documentation drift.
- **Minimum fix:** Use router consistently or remove dependency.

---

## 4. Security Summary

| Dimension | Judgment | Notes |
|-----------|----------|--------|
| **Authentication / login-state** | **Pass** | PBKDF2 hashing (`repo/src/crypto/password.ts`); lockout after 5 failures / 15 minutes (`authStore.ts` L26–29, L115–124, L58–63); session encrypted in LocalStorage (`authStore.ts` L165–169). |
| **Frontend route protection / guards** | **Partial Pass** | Unauthenticated users never reach `AppShell` (`App.tsx` L64–82). No URL router; `ProtectedRoute.tsx` is unused. Tab routes partially guarded (`TabContent.tsx`). |
| **Page-level / feature-level access control** | **Partial Pass** | Strong matrix in `permissions.ts`; admin/message pages use `PermissionGuard`; many editor pages rely on nav hiding + `requirePermission` throws. |
| **Sensitive information exposure** | **Pass** | No broad `console.log` of secrets in `src` (`grep`: only `console.error` in `App.tsx` L30 for init errors). Passwords hashed; demo seed passwords only in README (acceptable for offline demo). |
| **Cache / state isolation after user switch** | **Partial Pass** | `logout` clears session token from LocalStorage (`authStore.ts` L208–209) and deletes session row; IndexedDB remains shared (expected for multi-user portal on one profile). Same-browser profile switching is not a strong isolation boundary—acceptable for stated offline internal use if understood. |

---

## 5. Test Sufficiency Summary

### Test Overview

| Kind | Present? | Entry points |
|------|----------|--------------|
| Unit | **Yes** (per README + `src/test/crypto`, `utils`) | `pnpm test`, `vitest.config.ts` |
| Component | **Yes** | `loginPage.test.tsx`, `registerPage.test.tsx`, `tabContentPermissions.test.tsx`, etc. |
| Page / route integration | **Partial** | Dashboard, tab permission tests; routing is tab-based, not URL router |
| E2E | **No** | — |

### Core Coverage

| Area | Rating | Evidence |
|------|--------|----------|
| Happy path | **Partial** (static) | README lists bidding, lifecycle, publication workflow, document checkout, RBAC tests |
| Key failure paths | **Partial** | Login lockout tests referenced in README; service tests for validation/idempotency |
| Security-critical | **Partial** | `tabContentPermissions.test.tsx`, `rbac.test.ts`, crypto tests; no browser E2E |

### Major Gaps (max 3)

1. No E2E for real IndexedDB + BroadcastChannel + multi-tab bidding.  
2. Message Center retry / scheduling not covered (feature absent).  
3. Training flows untested (feature absent).

### Final Test Verdict

**Partial Pass** — strong Vitest footprint on paper; **execution unconfirmed** in this review; **no E2E**.

---

## 6. Engineering Quality Summary

**Credible for scope:** Clear separation of `services/`, `db/`, `crypto/`, `pages/`, `components/`, `store/`, and `types/`. Core auction logic is centralized (`biddingEngine.ts`) with transactions and idempotency. Append-only audit intent is documented.

**Material issues:** Unused router/`ProtectedRoute`, and mixed RBAC enforcement (guard vs service-only) reduce architectural clarity. Otherwise not a “single-file demo”; README and structure support maintainability.

---

## 7. Visual and Interaction Summary

**Applicable:** Yes (frontend).

The shell matches the brief (drawer + tabs) in `AppShell.tsx` / `NavDrawer.tsx`. Catalog and auction pages use consistent cards, loading spinners, and toasts in reviewed flows. No systematic visual audit was performed; no blocker-level visual breakage was evidenced from static review.

---

## 8. Next Actions

1. **High:** Implement or formally descope Message Center retries, templates, subscriptions, and read-receipt semantics.  
2. **High:** Add training completion flows for Participants **or** amend the prompt/contract.  
3. **High:** Resolve anti-sniping spec vs “once per auction” implementation (code or requirements).  
4. **Medium:** Add `PermissionGuard` (or equivalent) to all sensitive tab routes; integrate or remove React Router.  
5. **Medium:** Add minimal E2E smoke tests **or** document exclusion.

---

## Final Verification (self-check)

1. Material conclusions cite repo paths / lines or explicit search absence where appropriate.  
2. Test pass/fail is **not** claimed; execution boundary stated.  
3. Docker non-execution is **not** treated as a product defect.  
4. No evidence from `./.tmp/` was used.
