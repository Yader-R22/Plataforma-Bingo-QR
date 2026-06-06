---
name: Game deletion data-integrity
description: Rules for deleting/reactivating bingo games safely without destroying money records
---

# Game deletion & reactivation integrity

DELETE /api/games/:id (admin) must NEVER destroy financial records.

**Rule:** block deletion (HTTP 409) when the game has any card with `payment_status='paid'`.
Admin must finish such games instead of deleting them.

**Why:** card purchases debit wallets and validated winners credit them; deleting a
paid game with no refund/ledger reversal would silently lose real money.

**How to apply:**
- Cascade delete order is `winners -> cards -> games` (FK constraints), wrapped in a
  single `db.transaction`, plus an `audit_logs` row with `action='game_deleted'`.
- Reactivation is just `PATCH status='upcoming'`; no extra reset needed because
  `POST /:id/start` already clears `calledNumbers`. Prior validated winners are left
  intact on purpose (they were already paid) — do not delete them on reactivation.
