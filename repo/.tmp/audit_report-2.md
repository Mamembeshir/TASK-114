# Meridian Portal — Static Re-Audit (Post-Update)

## 1. Verdict

- **Overall conclusion:** **Partial Pass**

## 2. Scope and Static Verification Boundary

- **Reviewed:** updated auth/auction/wallet/import-export/training paths, permission routing, and key security tests in `src/test/**`.
- **Not reviewed exhaustively:** all UI presentation states and every domain edge case.
- **Intentionally not executed:** app runtime, tests, Docker, build.
- **Manual verification required:** cross-device encrypted backup restore and browser-time multi-tab behavior.

## 3. Repository / Requirement Mapping Summary

- Prompt goals remain well-mapped: offline SPA, local auth, role-based workflows, auction engine, document lifecycle, publishing workflow, notifications.
- Notable improvements in this update:
  - Audit event/type alignment appears fixed (`src/types/audit.ts:18`, `src/types/audit.ts:62`).
  - Auction detail now uses service-layer read instead of direct DB access (`src/pages/auction/AuctionDetailPage.tsx:46`).
  - Proxy reservation now computes prior hold from persisted wallet transactions (`src/services/walletService.ts:179`, `src/services/walletService.ts:217`).
  - Key portability path added via wrapped app key export/import (`src/crypto/appKey.ts:80`, `src/crypto/appKey.ts:96`, `src/pages/admin/DataExportPage.tsx:196`, `src/pages/admin/DataImportPage.tsx:89`).
  - Training role targeting enforcement added (`src/services/trainingService.ts:182`).

## 4. Section-by-section Review

### 1. Hard Gates

#### 1.1 Documentation and static verifiability

- **Conclusion:** Pass
- **Rationale:** startup/build/test instructions and config/script mapping are present and statically coherent.
- **Evidence:** `README.md:25`, `package.json:13`, `package.json:19`, `tsconfig.app.json:15`.

#### 1.2 Material deviation from Prompt

- **Conclusion:** Partial Pass
- **Rationale:** core scenario remains aligned; key portability mechanism exists, but some backup modes still have portability ambiguity.
- **Evidence:** `src/pages/admin/DataExportPage.tsx:175`, `src/pages/admin/DataExportPage.tsx:195`, `src/pages/admin/DataImportPage.tsx:99`.

### 2. Delivery Completeness

#### 2.1 Core requirements coverage

- **Conclusion:** Partial Pass
- **Rationale:** most requirements are implemented, but scheduled-auction visibility path is inconsistent and can break participant detail flow.
- **Evidence:** `src/pages/auction/AuctionBrowsePage.tsx:35`, `src/pages/auction/AuctionBrowsePage.tsx:54`, `src/services/auctionService.ts:177`, `src/services/auctionService.ts:196`, `src/pages/auction/AuctionDetailPage.tsx:78`.

#### 2.2 End-to-end 0→1 deliverable

- **Conclusion:** Pass
- **Rationale:** complete multi-module SPA structure remains intact.
- **Evidence:** `src/App.tsx:16`, `src/components/layout/AppShell.tsx:36`, `src/db/database.ts:36`.

### 3. Engineering and Architecture Quality

#### 3.1 Structure and module decomposition

- **Conclusion:** Pass
- **Rationale:** domain-service decomposition remains clean and consistent.
- **Evidence:** `src/services/auctionService.ts:1`, `src/services/documentService.ts:1`, `src/services/publicationService.ts:1`.

#### 3.2 Maintainability and extensibility

- **Conclusion:** Partial Pass
- **Rationale:** maintainability improved (typed audit events, service-layer scoping), but backup portability behavior differs by export mode and lacks full static proof.
- **Evidence:** `src/types/audit.ts:3`, `src/crypto/appKey.ts:49`, `src/pages/admin/DataExportPage.tsx:118`, `src/pages/admin/DataExportPage.tsx:175`.

### 4. Engineering Details and Professionalism

#### 4.1 Error handling, logging, validation, API practice

- **Conclusion:** Partial Pass
- **Rationale:** validation and guards are strong overall; one material logic regression remains (Scheduled auction detail not visible for participants).
- **Evidence:** `src/services/auctionService.ts:187`, `src/services/auctionService.ts:196`, `src/pages/auction/AuctionBrowsePage.tsx:35`.

#### 4.2 Product-like organization vs demo-only

- **Conclusion:** Pass
- **Rationale:** behavior and architecture continue to resemble a productized offline portal.
- **Evidence:** `src/services/importService.ts:189`, `src/services/notificationService.ts:299`, `src/pages/admin/DataImportPage.tsx:125`.

### 5. Prompt Understanding and Requirement Fit

#### 5.1 Business goal / scenario fit

- **Conclusion:** Partial Pass
- **Rationale:** most requirement semantics are now better addressed, but scheduled-auction participant access semantics are currently inconsistent.
- **Evidence:** `src/pages/auction/AuctionBrowsePage.tsx:2`, `src/pages/auction/AuctionBrowsePage.tsx:35`, `src/services/auctionService.ts:177`.

### 6. Aesthetics (frontend)

#### 6.1 Visual/interaction quality

- **Conclusion:** Cannot Confirm Statistically
- **Rationale:** static code shows structured components/responsive classes, but visual quality requires runtime inspection.
- **Evidence:** `src/components/layout/AppShell.tsx:30`, `src/components/ui/Button.tsx:1`.

## 5. Issues / Suggestions (Severity-Rated)

### High

1. **Scheduled auction detail becomes inaccessible for participants**

- **Severity:** High
- **Conclusion:** Fail
- **Evidence:** `src/pages/auction/AuctionBrowsePage.tsx:35`, `src/pages/auction/AuctionBrowsePage.tsx:54`, `src/services/auctionService.ts:177`, `src/services/auctionService.ts:178`, `src/services/auctionService.ts:196`, `src/pages/auction/AuctionDetailPage.tsx:46`, `src/pages/auction/AuctionDetailPage.tsx:78`
- **Impact:** participant can see Scheduled auctions in browse list but may get "Auction not found" in detail; core auction pre-start flow is broken/inconsistent.
- **Minimum actionable fix:** include `Scheduled` in participant-visible statuses (or hide Scheduled in browse list for participants) and keep list/detail policy consistent.

### Medium

2. **Backup portability path lacks static test coverage**

- **Severity:** Medium
- **Conclusion:** Partial Fail
- **Evidence:** `src/crypto/appKey.ts:80`, `src/crypto/appKey.ts:96`, `src/pages/admin/DataExportPage.tsx:196`, `src/pages/admin/DataImportPage.tsx:89`, `src/test/services/backupEncryptionContract.test.ts:1`
- **Impact:** key wrapping/unwrapping is security-critical but currently unverified by dedicated tests; regressions may go undetected.
- **Minimum actionable fix:** add tests for `wrapAppKey`/`unwrapAppKey` success path, wrong passphrase failure, and import behavior when wrapped key is present.

3. **Module CSV/JSON exports still have portability ambiguity for encrypted rows**

- **Severity:** Medium
- **Conclusion:** Partial Fail
- **Evidence:** `src/pages/admin/DataExportPage.tsx:175`, `src/pages/admin/DataExportPage.tsx:190`, `src/pages/admin/DataExportPage.tsx:195`, `src/pages/admin/DataImportPage.tsx:130`
- **Impact:** wrapped key is generated only for full JSON export; module exports containing encrypted rows can be transferred without decryption portability guarantees.
- **Minimum actionable fix:** either disable non-portable encrypted module exports, or include a clear portability warning and optional wrapped-key export for encrypted modules.

## 6. Security Review Summary

- **Authentication entry points:** **Pass** — local PBKDF2 auth + lockout remain in place (`src/store/authStore.ts:99`, `src/crypto/password.ts:11`).
- **Route-level authorization:** **Pass** — page-level guard remains broadly enforced (`src/components/layout/TabContent.tsx:170`).
- **Object-level authorization:** **Partial Pass** — service-layer auction visibility filter added (`src/services/auctionService.ts:192`), but scheduled visibility regression remains for participant flow.
- **Function-level authorization:** **Pass** — `requirePermission` remains consistently used (`src/services/importService.ts:193`, `src/services/notificationService.ts:222`).
- **Tenant / user isolation:** **Partial Pass** — per-user ownership checks remain present in notification operations (`src/services/notificationService.ts:90`, `src/services/notificationService.ts:120`).
- **Admin / internal / debug protection:** **Pass** — admin pages still permission-gated (`src/components/layout/TabContent.tsx:437`).

## 7. Tests and Logging Review

- **Unit tests:** **Pass** — broad suite remains present (`src/test/services/biddingEngine.test.ts:1`, `src/test/services/importService.test.ts:1`).
- **API / integration tests:** **Not Applicable** — frontend-only app; service-level tests present.
- **Logging categories / observability:** **Pass** — append-only audit pattern retained (`src/utils/audit.ts:9`).
- **Sensitive-data leakage risk in logs / responses:** **Partial Pass** — export includes sensitive backup material by design; operational handling remains critical (`src/pages/admin/DataExportPage.tsx:33`, `src/pages/admin/DataExportPage.tsx:242`).

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview

- Vitest + jsdom are configured for unit/component tests (`vitest.config.ts:10`, `vitest.config.ts:12`).
- Test setup includes fake IndexedDB (`src/test/setup.ts:3`).
- Commands are documented (`README.md:36`, `package.json:19`).

### 8.2 Coverage Mapping Table

| Requirement / Risk Point                                | Mapped Test Case(s)                                     | Key Assertion / Fixture / Mock                                                       | Coverage Assessment | Gap                                      | Minimum Test Addition                        |
| ------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------- | ---------------------------------------- | -------------------------------------------- |
| Auction engine (increment/proxy/anti-snipe/idempotency) | `src/test/services/biddingEngine.test.ts:98`            | min-bid and proxy outcome assertions (`src/test/services/biddingEngine.test.ts:223`) | basically covered   | no scheduled-visibility checks           | add list/detail visibility consistency tests |
| Object-level auth (catalog/publication/document)        | `src/test/services/objectLevelAuth.test.ts:93`          | cross-owner mutations forbidden (`src/test/services/objectLevelAuth.test.ts:145`)    | basically covered   | no auction object visibility test        | add auction visibility-by-status tests       |
| Tab route guards                                        | `src/test/layout/tabContentPermissions.test.tsx:162`    | denied/allowed role assertions on admin routes                                       | basically covered   | no `/auctions/:id` route behavior checks | add route tests for auction detail           |
| Backup encryption contract                              | `src/test/services/backupEncryptionContract.test.ts:78` | ciphertext export + import roundtrip                                                 | basically covered   | no wrap/unwrap key tests                 | add app-key wrap/unwrap test suite           |
| Import permission/conflicts                             | `src/test/services/importService.test.ts:266`           | forbidden roles + conflict strategies                                                | sufficient          | no wrapped-key integration checks        | add import-with-wrapped-key tests            |

### 8.3 Security Coverage Audit

- **Authentication:** covered by auth and lockout tests; severe auth defects less likely to slip.
- **Route authorization:** partially covered; admin-route guard tested, auction-detail route/object scope not tested.
- **Object-level authorization:** partially covered; auction visibility scope remains untested.
- **Tenant / data isolation:** covered for notifications ownership.
- **Admin / internal protection:** covered for major admin routes.

### 8.4 Final Coverage Judgment

- **Final Coverage Judgment:** **Partial Pass**
- Major workflows are tested, but severe defects could still pass due to missing coverage in auction detail visibility semantics and key-wrap portability flows.

## 9. Final Notes

- Re-audit confirms multiple prior issues were fixed.
- Remaining acceptance risk is now concentrated in one high functional inconsistency (scheduled auction detail visibility) plus medium test/portability robustness gaps.
