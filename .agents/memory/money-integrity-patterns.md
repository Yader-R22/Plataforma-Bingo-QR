---
name: Money-integrity patterns (bingo flows)
description: How concurrent/repeat money operations must stay exactly-once across buy, claim, number-call, winner approval, withdrawal
---

# Money-integrity patterns

All balance-changing and slot-allocating operations must be exactly-once under
repeat clicks and concurrency. The rule: **state transition + side effect go in
ONE transaction, and the transition is conditional on current state.**

**Why:** an earlier audit found classic bugs — debit-before-insert on buy,
SELECT-then-INSERT races on claim cap/place, lost-update on number calling,
double-credit on repeat winner approval, double-debit on repeat withdrawal
mark-paid. Money apps cannot rely on a prior read still being true at write time.

**How to apply:**
- **Buy with balance:** debit + card inserts + audit inside one `db.transaction`;
  use a conditional debit so insufficient balance aborts (set a flag, return
  outside tx).
- **Claim bingo:** lock the game row (`SELECT id FROM games WHERE id=? FOR UPDATE`)
  inside the tx, then dedupe-by-card + count winners + assign place + insert +
  audit. Final guard is the DB unique constraint on `winners.card_id`. Surface
  dup/cap via flags set inside the tx, checked after.
- **Call number:** atomic `UPDATE games SET called_numbers =
  array_append(called_numbers, n) WHERE id=? AND status='active' AND NOT
  (n = ANY(called_numbers))`; `rowCount === 0` → 409 duplicate; re-select to
  return the new array. (`called_numbers` is `integer[]`.)
- **Winner approval (admin):** flip `validated false→true` with conditional
  `WHERE id=? AND validated=false` `.returning()`; empty result → "ya fue
  validado" (no credit). Credit only inside the same tx after a successful flip.
- **Withdrawal mark-paid (admin):** flip `status pending→paid` with conditional
  `WHERE id=? AND status='pending'` `.returning()`; empty → "ya fue procesado".
  Debit only inside the same tx after a successful flip.
- **Fund reservation:** balance is debited at mark-paid, NOT at request time, so
  pending withdrawals are an unfunded liability. EVERY spend path (card buy, new
  withdrawal request) must check **available = balance − sum(pending
  withdrawals)**, not raw balance, or the balance can go negative. Enforce it
  atomically in the conditional UPDATE (subtract the pending SUM subquery in the
  WHERE), not just in a precheck.
- **Lock-then-recheck:** after `SELECT ... FOR UPDATE` on a row, RE-READ the
  state you branched on in the precheck (e.g. game `status='active'`); it may
  have changed between precheck and lock. A claim must abort if the game closed.

Pattern for TS: declare `let row: typeof table.$inferSelect | undefined` and
boolean flags (`alreadyValidated`, `capReached`) outside the tx, set inside,
branch after the tx closes.
