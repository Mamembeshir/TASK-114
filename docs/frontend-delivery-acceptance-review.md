# Frontend Delivery Acceptance / Architecture Inspection

**Reviewed artifact:** `repo/` — Meridian Offline Commerce & Compliance Portal (React + TypeScript + Vite).  
**Business / task prompt & criteria:** As provided in the inspection request (metadata aligns with `metadata.json`).  
**Date:** 2026-04-02  

---

## 1. Verdict

**Partial Pass**

The project is a credible, buildable SPA with a clear module split, IndexedDB persistence, substantial domain services, and many prompt-aligned surfaces (auctions, catalog, publishing, documents, notifications, outbound queue, audit, export). It does **not** meet the prompt as a complete specification (notably authentication policy, several Message Center and catalog features, trainings, and some publishing UI scope). Run documentation and automated verification are weakened by Docker-first README/test scripting and one failing unit test.

---

## 2. Scope and Verification Boundary

| Area | Status |
|------|--------|
| **Reviewed** | `repo/src/**` (layout, auth, pages, services, store, db, crypto, tests), `repo/package.json`, `repo/README.md`, `repo/run_tests.sh`, `repo/vite.config.ts`; workspace `metadata.json`. |
| **Excluded** | `./.tmp/` and any subtree (per instructions — not used). |
| **Not executed** | Docker, `docker compose`, `./run_tests.sh` (all Docker-based). |
| **Docker** | README’s primary “How to Run” and recommended tests use Docker; **Docker-based runtime verification was not performed** (per execution rules). |
| **Executed (local, no Docker, no extra network)** | `pnpm test`, `pnpm run build` in `repo/` with existing `node_modules`. |
| **Unconfirmed** | Runtime behavior in a browser for all flows (manual UAT); cross-tab bidding under real multi-tab load; exact retention of 20 publication versions (schema supports versions; cap not verified in this review). |

---

## 3. Top Findings

| # | Severity | Conclusion | Brief rationale | Evidence | Impact | Minimum actionable fix |
|---|----------|------------|-----------------|----------|--------|------------------------|
| 1 | **High** | Prompt-specified **account lockout** and **minimum 12-character password** policy are not implemented. | Login accepts any non-empty password length; no failed-attempt tracking or 15-minute lockout in auth flow. Admin user creation validates **8** characters, not 12. | `repo/src/store/authStore.ts` (login: ~72–124 — no lockout); `repo/src/pages/LoginPage.tsx` (~23–30 — only non-empty check); `repo/src/pages/admin/UserManagementPage.tsx` (~79 — `length < 8`) | Weakens stated security posture and fails explicit prompt requirements. | Enforce 12+ chars on create/change password; persist failed attempt counts (e.g. per username in IndexedDB) and block login for 15 minutes after 5 failures; align all validators. |
| 2 | **High** | **Automated test suite does not fully pass** in the documented non-Docker path (`pnpm test`). | Vitest reports 1 failing test in crypto encryption round-trip. | Command output: `encryption.test.ts` — `Failed to execute 'importKey' on 'SubtleCrypto': 2nd argument is not instance of ArrayBuffer...` at `repo/src/crypto/encryption.ts` ~58–60, called from `repo/src/test/crypto/encryption.test.ts` ~54–57 | CI/local gates fail; undermines confidence in Web Crypto path used for sessions/sensitive data. | Fix `importKey` to pass an `ArrayBuffer` view acceptable to the test environment (e.g. copy slice to new `ArrayBuffer`) and re-run tests. |
| 3 | **High** | **Run and test documentation skews to Docker**; non-container workflow is not described in README “How to Run,” while `package.json` supports local Node. | README positions Docker as the primary/only documented start path; `run_tests.sh` always builds/runs via Docker. | `repo/README.md` ~8–33, ~88–112; `repo/run_tests.sh` ~56–71; `repo/package.json` ~6–16 | Acceptance 1.1: reviewers without Docker lack an explicit, first-class documented path matching “without modifying core code.” | Document `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm preview`, and `pnpm test` as first-class options; keep Docker as optional. |
| 4 | **High** | Several **explicit prompt capabilities are missing or only partially present** in code. | No trainings for participants; catalog lacks reviews/ratings, trending (7-day), recent-search suggestions, sort by sales; no carousel support found; notification service has no 1/5/15 minute retry ladder, templates, read receipts, or subscription preferences (grep across `src`). | Training: no matches in `repo/src`; catalog model `repo/src/types/catalog.ts` (no ratings/reviews); browse sorts `repo/src/pages/catalog/CatalogBrowsePage.tsx` ~14–28, ~114–120; carousel: no matches in `repo/src`; `repo/src/services/notificationService.ts` (queue CRUD only, ~74–118) | Prompt fit and completeness (criteria 2.1, 5.1) materially incomplete. | Implement or document deferrals; prioritize trainings, catalog analytics/reviews/sorts, and message-center retry/subscription/read-receipt flows per spec. |
| 5 | **High** | **Permission enforcement is primarily navigation-level**; `ProtectedRoute` / React Router are not integrated into the running app. | `App.tsx` gates on `currentUser` then renders `AppShell`; `main.tsx` has no `BrowserRouter`. `ProtectedRoute` is the only `react-router-dom` import and is unused. Services such as `createAuction` do not check roles. | `repo/src/App.tsx` ~52–67; `repo/src/main.tsx`; `grep` shows `ProtectedRoute.tsx` sole `react-router-dom` usage; `repo/src/services/auctionService.ts` ~25–51 (no permission check) | Risk of privilege bypass via devtools/console calling services or opening tabs (client-only threat model still expects UI + consistent guards per criteria 3–4). | Wire router + guards **or** enforce `hasPermission` at page mount and on each mutation in the service layer. |
| 6 | **Medium** | **Anti-sniping** behavior may **diverge** from the prompt’s wording (“when a valid bid is placed in the last 30 seconds”) vs implemented “once per auction.” | Engine comments/tests describe a single extension per auction. | `repo/src/services/biddingEngine.ts` ~4–8, ~25–26 | If stakeholders expect repeated extensions, current logic under-delivers. | Clarify spec vs implementation; adjust engine if repeated extensions are required. |
| 7 | **Medium** | **Dashboard “Quick Actions”** are non-functional placeholders. | Handlers contain “wired in Phase N” comments only. | `repo/src/pages/DashboardPage.tsx` ~188–239 | Incomplete primary flows; feels demo-like on the home page. | Wire `openTab` to the same paths as the drawer or remove until implemented. |
| 8 | **Medium** | Document **watermark** text does not match the prompt’s exact phrase. | Prompt: “CONFIDENTIAL – INTERNAL USE”; code generates a different pattern. | `repo/src/services/documentService.ts` (~22 — `CONFIDENTIAL · ${displayName}...`) | Minor compliance/presentation mismatch. | Align visible watermark string with required legal text while keeping user/date metadata if needed. |
| 9 | **Low** | **Default admin credentials** are published in README. | Common for seeds but increases predictable first-login risk if combined with missing lockout. | `repo/README.md` ~301–309 | Operational security hygiene. | Force password change on first login (partially signaled by `isTemporaryPassword` in seed) and avoid shipping defaults in public docs where possible. |

---

## 4. Security Summary

| Dimension | Judgment | Notes |
|-----------|----------|--------|
| **Authentication / login-state handling** | **Partial Pass** | PBKDF2 verification and encrypted session blob in LocalStorage are implemented (`repo/src/store/authStore.ts`, `repo/src/crypto/password.ts`). Missing lockout and 12-character policy (see Finding 1). |
| **Frontend route protection / route guards** | **Partial Pass** | Authenticated shell vs login is enforced in `App.tsx`. Declared `ProtectedRoute` is unused; no URL-level router integration (`main.tsx`). |
| **Page-level / feature-level access control** | **Partial Pass** | `NavDrawer` hides items via `usePermission` (`repo/src/components/layout/NavDrawer.tsx` ~139–143). Many pages check specific capabilities (e.g. `AuctionDetailPage` ~31). Service mutations generally do not re-check permissions (Finding 5). |
| **Sensitive information exposure** | **Partial Pass** | No `console.log` in app source (`grep` over `repo/src`). Default credentials documented in README. Bidder display uses truncated ids (`AuctionDetailPage.tsx` ~169–171). |
| **Cache / state isolation after switching users** | **Cannot Confirm** | Logout clears session token and store (`authStore.ts` ~128–146). IndexedDB remains shared on the device (expected for offline SPA); full multi-profile isolation was not traced for every store subscriber. |

---

## 5. Test Sufficiency Summary

**Test overview**

- **Unit tests:** Yes — Vitest under `repo/src/test/crypto`, `utils`, `services`.  
- **Component tests:** Minimal — `repo/src/test/app.test.tsx` (1 test).  
- **Page / route integration tests:** Effectively **missing** (no React Router integration tests; routing is tab-based).  
- **E2E tests:** **Missing** (no Playwright/Cypress or similar in repo).  
- **Obvious entry points:** `pnpm test` / `vitest run`; Docker path `./run_tests.sh` (not executed here).

**Core coverage**

| Area | Assessment |
|------|------------|
| Happy path (domain services) | **Partial** — strong coverage for bidding, publications, documents, auctions lifecycle in service tests; UI flows largely untested. |
| Key failure paths | **Partial** — validation and engine guards tested in services; login lockout, permission denial, and tab routing not covered. |
| Security-critical coverage | **Partial** — password and encryption tests exist; one encryption test **fails** locally; no tests for lockout or permission bypass. |

**Major gaps (up to 3)**

1. Failing `importKey` / encryption round-trip test blocks a green suite.  
2. No E2E or route-level tests for auth, RBAC, and primary workspaces.  
3. No tests for Message Center retry/subscription behavior (features largely absent).

**Final test verdict:** **Fail** (current `pnpm test` exit code non-zero; structural gaps for UI and security-critical paths).

---

## 6. Engineering Quality Summary

**Strengths:** Clear separation of `pages/`, `services/`, `db/`, `crypto/`, `store/`, and `types/`; Dexie schema with multiple indexes; lazy-loaded tabs; PWA build; append-only audit helper pattern documented in README.

**Material issues:** Unused `ProtectedRoute` and `react-router-dom` dependency without an integrated router; README/test runner coupling to Docker; dashboard stubs; encryption test/environment mismatch (Finding 2).

---

## 7. Visual and Interaction Summary

**Applicable:** Yes (substantial UI deliverable).

The shell (drawer, tabs, cards, toasts) supports a coherent enterprise look. **Material gap:** Dashboard quick actions are visually present but non-functional (`DashboardPage.tsx` ~188–239), which hurts perceived product completeness and interaction closure (criteria 4.2, 6.1).

---

## 8. Next Actions

1. **Fix failing encryption unit test** and restore a green `pnpm test` (unblocks verification).  
2. **Implement prompt auth controls:** 12-character minimum everywhere, 5-failure / 15-minute lockout.  
3. **Document non-Docker** dev/build/test commands in README; optionally provide a non-Docker test script.  
4. **Close prompt gaps** or publish an explicit scope delta: trainings, catalog reviews/trending/suggestions/sales sort, carousels, message templates/retries/read receipts/subscriptions.  
5. **Enforce permissions** at service or page level consistently; remove dead `ProtectedRoute` or integrate real routing and guards.

---

## Final verification (self-check)

1. Material conclusions cite paths, lines, or command output above.  
2. Docker non-execution is stated as a boundary, not a runtime defect.  
3. No evidence from `./.tmp/` was used.  
4. Unsupported guesses labeled **Cannot Confirm** where applicable.
