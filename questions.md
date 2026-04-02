# questions.md - Business Logic Questions Log
**Project:** Meridian Offline Commerce & Compliance Portal

Record of all unclear business-level aspects while understanding the prompt.

---

### 1. Auction Ending & No-Bid Scenario
**Question:** What should happen to an auction if no bids are placed by the end time?  
**My Understanding:** The prompt does not specify the behavior for unsold auctions.  
**Solution:** Mark the auction as "No Sale / Expired" and notify the seller (Admin/Content Editor). Inventory (if any) should return to available stock.

### 2. Deposit / Credit Wallet Deduction Timing
**Question:** When exactly is the deposit deducted from the user's credit wallet — at the time of placing a bid or only when the user wins the auction?  
**My Understanding:** Deducting at bid time may block users from bidding on multiple auctions. Deducting only on win is more user-friendly.  
**Solution:** Deduct deposit only when the user wins the auction. Hold a "reserved" amount during active bidding if needed.

### 3. Proxy Bidding Execution
**Question:** When multiple users have proxy bids set, how should the system determine the winner and auto-bid steps?  
**My Understanding:** The system must simulate bids in real-time respecting minimum increment rules and anti-sniping logic.  
**Solution:** Implement a deterministic proxy bidding engine that processes bids in timestamp + bid amount order.

### 4. Anti-Sniping Auto-Extension Trigger
**Question:** If a bid is placed in the last 30 seconds, should the extension happen only once or every time a new bid comes in during the extended period?  
**My Understanding:** Repeated extensions could make auctions run indefinitely.  
**Solution:** Extend by 2 minutes only once per auction when the final 30-second window is triggered.

### 5. Document Checkout & Concurrent Editing
**Question:** What happens if two Content Editors try to edit the same document at the same time?  
**My Understanding:** The prompt mentions "checkout with approval" but doesn't clarify exclusivity.  
**Solution:** Implement exclusive checkout (document locking). Only one user can check out a document at a time.

### 6. Document Numbering Format
**Question:** Should document numbering (e.g., ORG-2026-000123) be generated automatically on creation or on final approval?  
**My Understanding:** Early numbering might create gaps if documents are rejected.  
**Solution:** Generate final document number only when it moves from Draft to Approved status.

### 7. Retention Policy Enforcement
**Question:** Who can trigger document destruction after the retention period (7 years), and what is the exact two-step approval process?  
**My Understanding:** Prompt says "destruction requires a two-step approval".  
**Solution:** Require Reviewer + Administrator approval with mandatory audit trail and reason.

### 8. Sensitive Word Moderation Scope
**Question:** Should sensitive-word moderation run only on final publish, or also when saving drafts and during Reviewer approval?  
**My Understanding:** Early detection helps editors fix issues faster.  
**Solution:** Run moderation on save + on submit for review. Block publishing until all issues are resolved.

### 9. Readership Analytics in Offline Mode
**Question:** How should "unique readers" and "time-on-page" be accurately calculated in a fully offline environment?  
**My Understanding:** Since it's offline, we can only track local opens and time spent.  
**Solution:** Track local view events and aggregate analytics per user session. Sync statistics only when admin exports data.

### 10. Cross-Tab Bidding Consistency
**Question:** How should we handle the case where the same user opens the auction in multiple browser tabs?  
**My Understanding:** Prompt mentions BroadcastChannel for cross-tab sync.  
**Solution:** Use BroadcastChannel + IndexedDB transaction locks + idempotency keys to prevent duplicate bids.

### 11. Notification Delivery in Offline Environment
**Question:** Since there is no real SMS/Email, how should the "outbound queues" for official channels work?  
**My Understanding:** Prompt says they should be exportable.  
**Solution:** Maintain an outbound queue table in IndexedDB that can be exported as CSV/JSON for manual processing.

### 12. Role Hierarchy & Permission Inheritance
**Question:** Do higher roles (e.g., Administrator) automatically inherit all permissions of lower roles (Reviewer, Editor)?  
**My Understanding:** Not explicitly mentioned.  
**Solution:** Use explicit role-based permissions with clear matrix for each role.

---

**Status:** These questions will be resolved during development. Mark as **[x]** once a decision is implemented and documented.