# Previous Issues Fix Verification (Static-Only)

Date: 2026-04-08

Scope: Verified the previously reported issues only, using static code inspection (no runtime/test execution).

## Result Summary

1. **Notification service primitives too permissive (function-level auth)**

- **Status:** **Fixed (with minor residual hardening opportunity)**
- **What changed:** previously flagged primitives are now internal (non-exported): `createNotification`, `createNotificationForMany`, `queueOutboundMessage`.
- **Evidence:** `src/services/notificationService.ts:40`, `src/services/notificationService.ts:54`, `src/services/notificationService.ts:182`
- **Additional evidence:** outbound compose path is permission-gated.
- **Evidence:** `src/services/notificationService.ts:338`, `src/services/notificationService.ts:339`
- **Residual note:** `notify` / `notifyMany` remain exported and rely on authenticated context rather than explicit role checks, which may still be acceptable for internal service orchestration but can be further tightened if desired.
- **Evidence:** `src/services/notificationService.ts:479`, `src/services/notificationService.ts:516`, `src/services/notificationService.ts:520`

2. **Read-receipt/subscription read APIs lacked object-level read authorization**

- **Status:** **Fixed**
- **What changed:** `getSubscription` is now internal; public read API `getOwnSubscription` enforces ownership or `manageMessages`. `getReadReceipts` now checks auth + owner/admin access.
- **Evidence:** `src/services/notificationService.ts:353`, `src/services/notificationService.ts:370`, `src/services/notificationService.ts:376`, `src/services/notificationService.ts:446`, `src/services/notificationService.ts:450`
- **Caller update verified:** preferences page now uses `getOwnSubscription`.
- **Evidence:** `src/pages/notifications/NotificationCenterPage.tsx:12`, `src/pages/notifications/NotificationCenterPage.tsx:78`

3. **Anti-sniping documentation inconsistency**

- **Status:** **Fixed**
- **What changed:** questions log now matches “extend every qualifying last-30s bid, no cap”; system settings hint also matches repeated extension behavior.
- **Evidence:** `../docs/questions.md:26`, `src/pages/admin/SystemSettingsPage.tsx:160`, `CLAUDE.md:76`

4. **Document list “New Document” button gated by wrong permission**

- **Status:** **Fixed**
- **What changed:** CTA visibility now uses `createDocument` permission.
- **Evidence:** `src/pages/documents/DocumentListPage.tsx:48`, `src/pages/documents/DocumentListPage.tsx:221`

## Final Determination

- **Fixed:** 4 / 4 previously listed issues are addressed in the current code.
- **No reopened blocker/high issue** was identified within this focused re-check scope.
- **Static boundary:** runtime behavior remains manual-verification-required.
