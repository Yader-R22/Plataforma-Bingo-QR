---
name: Tu Bingazo architecture
description: Key decisions and gotchas for the Tu Bingazo bingo platform
---

## Auth
- JWT 30-day tokens, stored in localStorage as `token`
- Zustand store (`useAuthStore`) with persist middleware handles auth state
- `setAuthTokenGetter` wired to `localStorage.getItem("token")` in `hooks/useAuth.ts`
- `requireAuth` re-reads user from DB on every request (detects status changes)
- Admin user bootstrap: set `is_admin=true, status='active'` directly in DB after first registration

**Why:** No server-side sessions, stateless API; status changes (e.g. admin verifying user) take effect immediately without requiring re-login.

## Public vs Protected Routes
- `GET /api/games` and `GET /api/games/:id` are **public** (no auth)
- All other game, card, payment, wallet, profile routes require auth
- Admin routes use `requireAdmin` (checks both auth + is_admin flag)

**Why:** Users should be able to browse available games without being logged in.

## Bingo Card Generation
- 5×5 matrix, columns B(1-15)/I(16-30)/N(31-45)/G(46-60)/O(61-75)
- Center cell [2][2] = 0 (free space, always marked)
- Generated server-side in `cards.ts` `generateBingoCard()` function

## Bingo Claim Validation
- Server re-validates all marked numbers against `calledNumbers` array in game
- Marks are accepted only if the number was called (or it's the free space 0)
- Pattern check depends on `game.gameMode`: full_card, horizontal, vertical, diagonal, quina
- Winners stored as unvalidated; admin must validate to credit balance

**Why:** Prevents cheating — client cannot forge a win.

## Payments (PagosYa)
- Cards created in `pending_payment` state immediately on buy
- PagosYa checkout URL generated via POST to `PAGOSYA_BASE_URL/create-external-checkout`
- Cards activate when webhook `checkout.completed` event received
- Frontend polls `/api/payments/:checkoutId/status` every 3s for confirmation

## API Client Hook Names (Orval generated)
- `useListGames`, `useGetGame(id)`, `useListMyCards`, `useGetWallet`, `useListWithdrawals`
- NOT `useGetApiGames`, `useGetApiGamesId` etc — the Orval template uses camelCase from operation IDs

## DB Schema Files
All in `lib/db/src/schema/`: users, games, cards, winners, withdrawals, name_change_requests, audit_logs, feed_items
Re-exported from `lib/db/src/schema/index.ts`
