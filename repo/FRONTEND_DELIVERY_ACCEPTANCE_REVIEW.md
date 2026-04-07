# Frontend Delivery Acceptance Review — Meridian Offline Commerce & Compliance Portal

**Reviewer role:** Delivery Acceptance / Project Architecture Inspection  
**Review date:** 2026-04-02  
**Scope:** `repo/` (React + TypeScript SPA under Vite). Excluded: `./.tmp/` and all subpaths (per instructions; not read or used as evidence).

**Amendment (same date):** `CLAUDE.md` §4 (Anti-Sniping) was updated to match the implementation: extend by 2 minutes on **each** bid in the final 30s, no cap. The prior review finding about “once per auction” vs code is **withdrawn**; spec and `biddingEngine.ts` are aligned.

---

## 1. Verdict

**Partial Pass**

---

## 2. Scope and Verification Boundary

**Reviewed (static analysis):**

- `package.json` — scripts, dependencies, test runner (Vitest)
- `README.md` — startup and verification claims
- `Dockerfile`, `docker-compose.yml` — documented run path
- `src/App.tsx` — auth gate, session restore, seeding conditions
- `src/store/authStore.ts` — login (PBKDF2, lockout), logout, session
- `src/components/layout/TabContent.tsx` — routing, `PermissionGuard`
- `src/services/biddingEngine.ts` — anti-sniping, idempotency, proxy resolution
- `src/crypto/password.ts` — PBKDF2 parameters
- `vite.config.ts` — PWA / offline-oriented bundling
- Test file inventory under `src/test/**/*.test.{ts,tsx}`

**Excluded input:** Any path under `./.tmp/` (not opened).

**Not executed:**

- `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm test` — `node_modules` was not present; installing dependencies would require network access, which violates the stated runtime-verification rules for this review.
- Docker / Compose — per instructions, Docker-related commands were not run.

**Docker verification:** Not performed (constraint, not automatic defect). Static review shows a `Dockerfile` that runs `pnpm build` and serves `dist` on port 4173, consistent with `docker-compose.yml` port mapping.

**Unconfirmed without install/run:**

- Whether `pnpm build` / `pnpm test` succeed on a clean machine after `pnpm install`
- Runtime UI behavior, Lighthouse/PWA behavior, and cross-browser IndexedDB edge cases

---

## 3. Top Findings

| # | Severity | Conclusion | Brief rationale | Evidence | Impact | Minimum actionable fix |
|---|----------|------------|-----------------|----------|--------|-------------------------|
| 1 | **High** | Documented “seeded accounts” do not match the default production Docker build. | `seedDefaultAdmin()` runs only in dev or when `import.meta.env.VITE_SEED_DEMO === 'true'`. The `Dockerfile` runs `pnpm build` without setting `VITE_SEED_DEMO=true`, so the production image skips demo seeding. | `App.tsx` lines 27–31; `Dockerfile` line 19 (build with no `VITE_SEED_DEMO`); `README.md` lines 29–38 (table of usernames/passwords “on first launch”) | Users following README + Docker will not get the promised staff accounts unless they rebuild with the correct env or use dev mode; **documentation and primary path diverge** (Acceptance 1.1 / 2.2). | Document that production Docker requires `VITE_SEED_DEMO=true` at build time for demo staff accounts, **or** change the Docker build to pass that flag when demo accounts are desired, **or** remove/reword the README table. |
| 2 | **High** | Primary README documents only Docker; it omits the non-Docker workflow that exists in `package.json`. | Acceptance 1.1 expects clear start/build/preview instructions without forcing readers to infer from scripts. | `README.md` lines 5–9 (`docker compose up` only); `package.json` lines 11–21 (`dev`, `build`, `preview`, `test`) | Reviewers or operators avoiding Docker lack an official local Node/pnpm path in the main README. | Add a short “Local development (Node 20+, pnpm)” section: `pnpm install`, `pnpm dev` / `pnpm build` + `pnpm preview`, and note `.env` / `VITE_SEED_DEMO` for demo accounts. |
| 3 | **Medium** | No E2E (Playwright/Cypress) tests found; coverage is unit/service/component level only. | Acceptance prioritizes test sufficiency for core flows; absence of E2E limits confidence in full user journeys. | Glob for `**/playwright*`, `**/cypress*` — no matches; `package.json` has `vitest` only | Cannot confirm end-to-end regressions (login → tab nav → bid → document flow) from automated tests alone. | Add a minimal E2E suite for login, one restricted route, and one critical mutation (e.g. bid or approval). |
| 4 | **Low** | `app.test.tsx` asserts a static heading; it does not validate routing or auth shell. | Smoke test only; low signal for “real product” criterion. | `src/test/app.test.tsx` lines 5–9 | Minor gap in integration-level confidence. | Extend with authenticated render harness or route-level tests already partially covered elsewhere. |

*(Stopped at 4 findings after amendment; conditions: ≤10 findings, ≤5 High/Blocker — threshold met.)*

---

## 4. Security Summary

| Dimension | Judgment | Evidence / boundary |
|-----------|----------|---------------------|
| **Authentication / login-state** | **Pass** (within SPA threat model) | `authStore` uses PBKDF2 verification (`authStore.ts` ~122–124), lockout before DB (`~99–108`), session in IndexedDB + encrypted token in localStorage (`~136–150`, `restoreSession` ~199–242). |
| **Frontend route / feature guards** | **Pass** | `App.tsx` gates shell until `currentUser`; `TabContent` wraps routes in `PermissionGuard` (`TabContent.tsx` ~160–179); service layer uses `requirePermission` (`utils/permissions.ts`). |
| **Sensitive information exposure** | **Partial Pass** | No `console.log` in `src` (grep). `console.error` in `App.tsx` logs only `Error.message` / string, not raw objects (~37–39). README **publishes default passwords** (`README.md` table) — acceptable for a documented demo but increases risk if reused; not a code bug. |
| **Cache / state isolation after user switch** | **Pass** | `logout` removes session from IndexedDB and LS, clears `currentUser`, and resets `useTabStore` + `useNotificationStore` (`authStore.ts` ~175–197). |

**Cannot confirm:** Resistance to DevTools tampering with IndexedDB (inherent client-side limitation; not graded as Fail for an offline SPA).

---

## 5. Test Sufficiency Summary

**Test overview**

| Type | Present? | Entry points |
|------|----------|--------------|
| Unit / service | Yes | `src/test/services/*.test.ts`, `src/test/crypto/*.test.ts`, `src/test/utils/*.test.ts` |
| Component / page | Yes | `src/test/auth/*.test.tsx`, `src/test/pages/dashboardPage.test.tsx`, `src/test/layout/tabContentPermissions.test.tsx` |
| Page / route integration | Partial | RBAC and tab permission tests; not full router E2E |
| E2E | **No** | None located |

**Core coverage**

| Area | Assessment | Evidence |
|------|------------|----------|
| Happy path | **Partial** | Service tests (bidding, auction lifecycle, publications, documents) + login/register tests |
| Key failure paths | **Partial** | Lockout, validation, permission denied (tab tests); not exhaustively E2E |
| Security-critical | **Partial** | Password, encryption, RBAC tests; no automated E2E for “direct URL” abuse |

**Major gaps (up to 3)**

1. No E2E coverage for full authenticated workflows.
2. Runtime verification of test suite not performed (no `pnpm test` execution).
3. Production Docker + seeding mismatch not covered by an automated “first launch” test.

**Final test verdict:** **Partial Pass**

---

## 6. Engineering Quality Summary

The codebase shows **credible structure** for the scope: Dexie/IndexedDB schema, dedicated services (`biddingEngine`, wallet, notifications), Zustand stores, permission matrix, and Vitest tests with `fake-indexeddb`/`jsdom`. Separation of UI guards and `requirePermission` for mutations supports maintainability. **Primary credibility risks** are documentation/operational (README vs Docker seeding) and test depth (no E2E)—not a “single-file demo” failure. Anti-sniping is documented in `CLAUDE.md` §4 consistently with `biddingEngine.ts`.

---

## 7. Visual and Interaction Summary

**Not assessed in depth** — no browser session was run. Static structure (Tailwind, `sonner` toasts, loaders in `App.tsx` and `PageLoader`) suggests attention to feedback; **Cannot Confirm** polish and consistency without runtime UI review.

---

## 8. Next Actions

1. **Fix README vs production seeding** — align `Dockerfile`/env with documented demo accounts or rewrite README (highest unblock for Acceptance 1.1).
2. **Add non-Docker run instructions** to README (operators who cannot use Docker).
3. **Add minimal E2E** for login + one protected workflow.
4. **Run** `pnpm install && pnpm build && pnpm test` locally (or CI) and fix any failures — not executed in this review.

---

## Final Verification (self-check)

1. Material conclusions have file/line or inventory evidence — **Yes** (except unrun tests/build).
2. Claims bounded by evidence — **Yes**; visual quality marked Cannot Confirm.
3. Verdict holds if uncertain UI notes removed — **Yes** (Partial Pass driven by README/seed + test/E2E gaps; anti-sniping spec/code alignment confirmed after `CLAUDE.md` update).
4. No uncertain point stated as fact — **Yes**
5. Security/tests not overstated — **Yes**
6. Docker non-run not treated as build failure — **Yes**
7. No use of `./.tmp/` — **Yes**
