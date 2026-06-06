---
name: game categories
description: How the home-page bingo category cards (daily/weekly/monthly) are configured and managed.
---

# Game categories

The home "Sorteos Disponibles" cards are driven by the `game_categories` table, NOT hardcoded.

- Categories are a **fixed enum**: `daily`, `weekly`, `monthly` (the `type` column is `unique`). There is intentionally **no create endpoint** — only public `GET /categories` and admin `PATCH /categories/{id}`. Admins edit label/emoji/description/colors/sort_order/is_active; they cannot add or remove categories.
- The 3 default rows are **seeded idempotently on server startup** (`artifacts/api-server/src/lib/seed.ts`, called from `index.ts` after `listen`, using `onConflictDoNothing({ target: type })`). This guarantees a fresh DB (e.g. production deploy) always has editable rows.

**Why:** the product only has these 3 bingo cadences, so categories are a managed-config set, not user-generated data. Seeding on startup avoids a blank home page on fresh environments without requiring manual SQL.

**How to apply:** if a new cadence is ever needed, add it to the schema enum AND the seed list together. Card display intentionally shows only emoji/label/description/prize — date, participant count, and card price were deliberately removed from these cards.
