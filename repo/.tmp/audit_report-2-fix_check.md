# Verification Against Prior Re-Audit Findings (Static)

Date: 2026-04-08  
Scope: verify the 3 findings from "Meridian Portal — Static Re-Audit (Post-Update)" only  
Method: static code inspection only (no runtime/tests executed)

## Overall Result

- Findings checked: 3
- **Fixed: 3**
- Partially fixed: 0
- Not fixed: 0

## Finding Status

### 1) High — Scheduled auction detail inaccessible for participants

- **Status:** **Fixed**
- **Why:** participant-visible status policy now includes `Scheduled`, matching browse behavior and detail read path.
- **Evidence:**
  - Browse includes Scheduled/Active/Extended: `src/pages/auction/AuctionBrowsePage.tsx:35`
  - Public status whitelist now includes `Scheduled`: `src/services/auctionService.ts:177`, `src/services/auctionService.ts:178`
  - Detail uses service-layer `getAuction`: `src/pages/auction/AuctionDetailPage.tsx:46`

### 2) Medium — Backup portability path lacks static test coverage

- **Status:** **Fixed**
- **Why:** dedicated wrap/unwrap portability tests now exist, including success + wrong-passphrase + full round-trip.
- **Evidence:**
  - Test block added for key wrapping portability: `src/test/services/backupEncryptionContract.test.ts:185`
  - Correct-passphrase restore test: `src/test/services/backupEncryptionContract.test.ts:186`
  - Wrong-passphrase failure test: `src/test/services/backupEncryptionContract.test.ts:212`
  - Full export/unwrap/import/read round-trip test: `src/test/services/backupEncryptionContract.test.ts:217`

### 3) Medium — Module CSV/JSON export portability ambiguity for encrypted rows

- **Status:** **Fixed**
- **Why:** encrypted modules are explicitly identified; JSON exports for those modules require passphrase+wrapped key, and CSV path now warns about non-portability.
- **Evidence:**
  - Encrypted module set (`all`, `documents`, `auctions`): `src/pages/admin/DataExportPage.tsx:27`
  - Passphrase requirement for JSON when encrypted module selected: `src/pages/admin/DataExportPage.tsx:178`, `src/pages/admin/DataExportPage.tsx:180`
  - Wrapped key emitted for encrypted-module JSON exports: `src/pages/admin/DataExportPage.tsx:203`, `src/pages/admin/DataExportPage.tsx:206`
  - Explicit CSV non-portability warning: `src/pages/admin/DataExportPage.tsx:191`, `src/pages/admin/DataExportPage.tsx:192`

## Notes

- This verification only answers whether the specific 3 prior findings are now fixed.
- It does not replace a full new acceptance audit across the entire repository.
