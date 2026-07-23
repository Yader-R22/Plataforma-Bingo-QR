import { pool } from "@workspace/db";
import { logger } from "./logger";

const MIGRATIONS: string[] = [
  // ── users ──────────────────────────────────────────────────────────────────
  `ALTER TABLE users ADD COLUMN reset_photo_front TEXT`,
  `ALTER TABLE users ADD COLUMN reset_photo_back TEXT`,
  `ALTER TABLE users ADD COLUMN reset_photo_selfie TEXT`,
  `ALTER TABLE users ADD COLUMN needs_ci_upload BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE users ADD COLUMN rejection_reason TEXT`,
  `ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE users ADD COLUMN temp_password_display TEXT`,
  `ALTER TABLE users ADD COLUMN temp_password_expires_at TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN bonus_balance NUMERIC(10,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN bonus_expires_at TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN admin_credit_balance NUMERIC(10,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN referred_by_code TEXT`,
  `ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE users ADD COLUMN ban_reason TEXT`,
  `ALTER TABLE users ADD COLUMN admin_permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
  `ALTER TABLE users ADD COLUMN last_known_ip TEXT`,

  // ── games ──────────────────────────────────────────────────────────────────
  `ALTER TABLE games ADD COLUMN rounds JSONB`,
  `ALTER TABLE games ADD COLUMN current_round INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE games ADD COLUMN round_history JSONB`,
  `ALTER TABLE games ADD COLUMN slug TEXT`,
  `ALTER TABLE games ADD COLUMN cover_image_url TEXT`,
  `ALTER TABLE games ADD COLUMN prize_type TEXT NOT NULL DEFAULT 'cash'`,
  `ALTER TABLE games ADD COLUMN prize_physical_name TEXT`,
  `ALTER TABLE games ADD COLUMN prize_physical_description TEXT`,
  `ALTER TABLE games ADD COLUMN prize_image_url TEXT`,
  `ALTER TABLE games ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE games ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE games ADD COLUMN prizes JSONB DEFAULT '[]'::JSONB`,
  `ALTER TABLE games ADD COLUMN organizer_user_id INTEGER REFERENCES users(id)`,

  // ── cards ──────────────────────────────────────────────────────────────────
  `ALTER TABLE cards ADD COLUMN bonus_amount_used NUMERIC(10,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE cards ADD COLUMN admin_credit_amount_used NUMERIC(10,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE cards ADD COLUMN is_predefined BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE cards ADD COLUMN predefined_round INTEGER`,

  // ── winners ────────────────────────────────────────────────────────────────
  `ALTER TABLE winners ADD COLUMN round INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE winners ADD COLUMN place INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE winners ADD COLUMN is_historical BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE winners ADD COLUMN admin_notes TEXT`,
  `ALTER TABLE winners ADD COLUMN prize_type TEXT`,
  `ALTER TABLE winners ADD COLUMN prize_physical_name TEXT`,
  `ALTER TABLE winners ADD COLUMN delivery_status TEXT`,
  `ALTER TABLE winners ADD COLUMN delivery_address TEXT`,
  `ALTER TABLE winners ADD COLUMN delivery_phone TEXT`,
  `ALTER TABLE winners ADD COLUMN delivery_receipt_url TEXT`,
  `ALTER TABLE winners ADD COLUMN delivery_notes TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS winners_card_round_uniq ON winners (card_id, round)`,

  // ── withdrawals ────────────────────────────────────────────────────────────
  `ALTER TABLE withdrawals ADD COLUMN bank_qr_url TEXT`,
  `ALTER TABLE withdrawals ADD COLUMN bank_account_info TEXT`,
  `ALTER TABLE withdrawals ADD COLUMN notes TEXT`,
  `ALTER TABLE withdrawals ADD COLUMN payment_proof_url TEXT`,
  `ALTER TABLE withdrawals ADD COLUMN withdrawal_pin TEXT`,
  `ALTER TABLE withdrawals ADD COLUMN paid_at TIMESTAMPTZ`,

  // ── audit_logs ─────────────────────────────────────────────────────────────
  `ALTER TABLE audit_logs ADD COLUMN ip_address TEXT`,

  // ── banners ────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS banners (
    id            SERIAL PRIMARY KEY,
    image_url     TEXT NOT NULL,
    media_type    TEXT NOT NULL DEFAULT 'image',
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE banners ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image'`,

  // ── push_subscriptions ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── feed_items ─────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS feed_items (
    id                SERIAL PRIMARY KEY,
    type              TEXT NOT NULL,
    message           TEXT NOT NULL,
    amount            NUMERIC(10,2),
    user_display_name TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── site_settings ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS site_settings (
    id                        SERIAL PRIMARY KEY,
    site_name                 TEXT NOT NULL DEFAULT 'Tu Bingazo',
    site_tagline              TEXT NOT NULL DEFAULT 'Bingo en Vivo Bolivia',
    site_emoji                TEXT NOT NULL DEFAULT '🎱',
    favicon_url               TEXT,
    logo_url                  TEXT,
    seo_title                 TEXT NOT NULL DEFAULT 'Tu Bingazo — Bingo en Vivo Bolivia',
    seo_description           TEXT NOT NULL DEFAULT 'La plataforma de bingo en vivo más grande de Bolivia.',
    seo_keywords              TEXT NOT NULL DEFAULT 'bingo, bolivia, bingo en vivo, premios, dinero',
    primary_color             TEXT NOT NULL DEFAULT '#1a0050',
    qr_background_url         TEXT,
    banner_interval           INTEGER NOT NULL DEFAULT 5,
    banner_version            INTEGER NOT NULL DEFAULT 1,
    support_whatsapp          TEXT,
    payment_api_key           TEXT,
    pwa_short_name            TEXT NOT NULL DEFAULT 'Bingazo',
    pwa_cache_version         INTEGER NOT NULL DEFAULT 1,
    pwa_icon_url              TEXT,
    pwa_icon_192_url          TEXT,
    pwa_display_mode          TEXT NOT NULL DEFAULT 'standalone',
    pwa_orientation           TEXT NOT NULL DEFAULT 'portrait',
    pwa_theme_color           TEXT,
    pwa_bg_color              TEXT,
    pwa_start_url             TEXT NOT NULL DEFAULT '/',
    pwa_categories            TEXT NOT NULL DEFAULT 'games,entertainment',
    terms_and_conditions      TEXT,
    og_image_url              TEXT,
    fallback_qr_image_url     TEXT,
    fallback_qr_force_enabled BOOLEAN NOT NULL DEFAULT false,
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_id             INTEGER REFERENCES users(id)
  )`,
  `ALTER TABLE site_settings ADD COLUMN pwa_short_name TEXT NOT NULL DEFAULT 'Bingazo'`,
  `ALTER TABLE site_settings ADD COLUMN pwa_cache_version INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE site_settings ADD COLUMN pwa_icon_url TEXT`,
  `ALTER TABLE site_settings ADD COLUMN pwa_icon_192_url TEXT`,
  `ALTER TABLE site_settings ADD COLUMN pwa_display_mode TEXT NOT NULL DEFAULT 'standalone'`,
  `ALTER TABLE site_settings ADD COLUMN pwa_orientation TEXT NOT NULL DEFAULT 'portrait'`,
  `ALTER TABLE site_settings ADD COLUMN pwa_theme_color TEXT`,
  `ALTER TABLE site_settings ADD COLUMN pwa_bg_color TEXT`,
  `ALTER TABLE site_settings ADD COLUMN pwa_start_url TEXT NOT NULL DEFAULT '/'`,
  `ALTER TABLE site_settings ADD COLUMN pwa_categories TEXT NOT NULL DEFAULT 'games,entertainment'`,
  `ALTER TABLE site_settings ADD COLUMN terms_and_conditions TEXT`,
  `ALTER TABLE site_settings ADD COLUMN og_image_url TEXT`,
  `ALTER TABLE site_settings ADD COLUMN fallback_qr_image_url TEXT`,
  `ALTER TABLE site_settings ADD COLUMN fallback_qr_force_enabled BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE site_settings ADD COLUMN support_whatsapp TEXT`,
  `ALTER TABLE site_settings ADD COLUMN payment_api_key TEXT`,
  `ALTER TABLE site_settings ADD COLUMN qr_background_url TEXT`,
  `ALTER TABLE site_settings ADD COLUMN site_tagline TEXT NOT NULL DEFAULT 'Bingo en Vivo Bolivia'`,
  `ALTER TABLE site_settings ADD COLUMN site_emoji TEXT NOT NULL DEFAULT '🎱'`,
  `ALTER TABLE site_settings ADD COLUMN favicon_url TEXT`,
  `ALTER TABLE site_settings ADD COLUMN logo_url TEXT`,
  `ALTER TABLE site_settings ADD COLUMN seo_title TEXT NOT NULL DEFAULT 'Tu Bingazo — Bingo en Vivo Bolivia'`,
  `ALTER TABLE site_settings ADD COLUMN seo_description TEXT NOT NULL DEFAULT 'La plataforma de bingo en vivo más grande de Bolivia.'`,
  `ALTER TABLE site_settings ADD COLUMN seo_keywords TEXT NOT NULL DEFAULT 'bingo, bolivia, bingo en vivo, premios, dinero'`,
  `ALTER TABLE site_settings ADD COLUMN primary_color TEXT NOT NULL DEFAULT '#1a0050'`,
  `ALTER TABLE site_settings ADD COLUMN banner_interval INTEGER NOT NULL DEFAULT 5`,
  `ALTER TABLE site_settings ADD COLUMN banner_version INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE site_settings ADD COLUMN updated_by_id INTEGER REFERENCES users(id)`,
  `INSERT INTO site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,

  // ── game_categories ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS game_categories (
    id                   SERIAL PRIMARY KEY,
    type                 TEXT NOT NULL UNIQUE,
    label                TEXT NOT NULL,
    emoji                TEXT NOT NULL DEFAULT '🎱',
    description          TEXT NOT NULL DEFAULT '',
    color_from           TEXT NOT NULL DEFAULT '#1a0050',
    color_to             TEXT NOT NULL DEFAULT '#3b00b8',
    sort_order           INTEGER NOT NULL DEFAULT 0,
    is_active            BOOLEAN NOT NULL DEFAULT true,
    background_image_url TEXT,
    stream_url_youtube   TEXT,
    stream_url_tiktok    TEXT,
    stream_url_facebook  TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── name_change_requests ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS name_change_requests (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    requested_name TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',
    admin_notes    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at    TIMESTAMPTZ
  )`,

  // ── referral_codes ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS referral_codes (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    code       TEXT NOT NULL UNIQUE,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── referral_transactions ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS referral_transactions (
    id                    SERIAL PRIMARY KEY,
    type                  TEXT NOT NULL,
    activator_id          INTEGER NOT NULL REFERENCES users(id),
    referred_user_id      INTEGER NOT NULL REFERENCES users(id),
    game_id               INTEGER REFERENCES games(id),
    winner_id             INTEGER REFERENCES winners(id),
    amount                NUMERIC(10,2) NOT NULL,
    commission_percentage NUMERIC(5,2),
    description           TEXT NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── activator_requests ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS activator_requests (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    status         TEXT NOT NULL DEFAULT 'pending',
    notes          TEXT,
    reviewed_by_id INTEGER REFERENCES users(id),
    reviewed_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── activator_settings ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS activator_settings (
    id                       SERIAL PRIMARY KEY,
    is_enabled               BOOLEAN NOT NULL DEFAULT true,
    whatsapp_group_link      TEXT,
    bonus_amount             NUMERIC(10,2) NOT NULL DEFAULT 5,
    bonus_title              TEXT NOT NULL DEFAULT 'Bono de bienvenida',
    commission_percentage    NUMERIC(5,2) NOT NULL DEFAULT 5,
    commission_duration      TEXT NOT NULL DEFAULT 'indefinite',
    commission_duration_months INTEGER,
    bonus_validity_hours     INTEGER,
    card_sale_enabled        BOOLEAN NOT NULL DEFAULT true,
    card_sale_discount_type  TEXT NOT NULL DEFAULT 'percentage',
    card_sale_discount_value NUMERIC(10,2) NOT NULL DEFAULT 10,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_id            INTEGER REFERENCES users(id)
  )`,
  `INSERT INTO activator_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,

  // ── activator_card_sales ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS activator_card_sales (
    id                SERIAL PRIMARY KEY,
    activator_user_id INTEGER NOT NULL REFERENCES users(id),
    target_user_id    INTEGER NOT NULL REFERENCES users(id),
    game_id           INTEGER NOT NULL REFERENCES games(id),
    quantity          INTEGER NOT NULL,
    original_price    NUMERIC(10,2) NOT NULL,
    discount_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
    final_price       NUMERIC(10,2) NOT NULL,
    payment_method    TEXT NOT NULL,
    checkout_id       TEXT,
    receipt_url       TEXT,
    card_ids          TEXT,
    status            TEXT NOT NULL DEFAULT 'pending_payment',
    admin_notes       TEXT,
    reviewed_by_id    INTEGER REFERENCES users(id),
    reviewed_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── partners ───────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS partners (
    id               SERIAL PRIMARY KEY,
    name             TEXT NOT NULL,
    identifier       TEXT,
    phone            TEXT,
    share_percentage NUMERIC(5,2) NOT NULL,
    notes            TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── partner_payments ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS partner_payments (
    id                SERIAL PRIMARY KEY,
    period_label      TEXT NOT NULL,
    period_from       TIMESTAMPTZ NOT NULL,
    period_to         TIMESTAMPTZ NOT NULL,
    gross_revenue     NUMERIC(10,2) NOT NULL,
    net_profit        NUMERIC(10,2) NOT NULL,
    total_paid        NUMERIC(10,2) NOT NULL,
    partners_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB,
    finance_snapshot  JSONB,
    admin_notes       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── operating_expenses ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS operating_expenses (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    amount     NUMERIC(10,2) NOT NULL,
    frequency  TEXT NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── ci_change_requests ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS ci_change_requests (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    current_ci      TEXT NOT NULL,
    requested_ci    TEXT NOT NULL,
    photo_front_url TEXT,
    photo_back_url  TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    admin_notes     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
  )`,

  // ── manual_payment_requests ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS manual_payment_requests (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    game_id         INTEGER NOT NULL REFERENCES games(id),
    quantity        INTEGER NOT NULL,
    expected_amount NUMERIC(10,2) NOT NULL,
    card_ids        TEXT,
    receipt_url     TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    admin_notes     TEXT,
    reviewed_by_id  INTEGER REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── game_authorized_activators ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS game_authorized_activators (
    id                SERIAL PRIMARY KEY,
    game_id           INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    activator_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── wallet_top_ups ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS wallet_top_ups (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    amount          NUMERIC(10,2) NOT NULL,
    checkout_id     TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    receipt_url     TEXT,
    admin_notes     TEXT,
    reviewed_by_id  INTEGER REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── organizer_requests ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS organizer_requests (
    id                    SERIAL PRIMARY KEY,
    user_id               INTEGER NOT NULL REFERENCES users(id),
    status                TEXT NOT NULL DEFAULT 'pending',
    admin_notes           TEXT,
    reviewed_by_id        INTEGER REFERENCES users(id),
    reviewed_at           TIMESTAMPTZ,
    commission_percentage NUMERIC(5,2),
    commission_paid_at    TIMESTAMPTZ,
    commission_amount     NUMERIC(10,2),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // Columns added later (idempotent for VPS that already has the table without them)
  `ALTER TABLE organizer_requests ADD COLUMN commission_percentage NUMERIC(5,2)`,
  `ALTER TABLE organizer_requests ADD COLUMN commission_paid_at TIMESTAMPTZ`,
  `ALTER TABLE organizer_requests ADD COLUMN commission_amount NUMERIC(10,2)`,

  // ── site_settings: organizer commission default ────────────────────────────
  `ALTER TABLE site_settings ADD COLUMN organizer_default_commission NUMERIC(5,2) NOT NULL DEFAULT 0`,
];

export async function runMigrations() {
  const client = await pool.connect();
  let ok = 0;
  let failed = 0;
  try {
    for (const sql of MIGRATIONS) {
      try {
        await client.query(sql);
        ok++;
      } catch (err: any) {
        // Ignore "already exists" errors — anything else is a real problem
        if (!err?.message?.includes("already exists")) {
          logger.error({ err: err?.message, sql: sql.slice(0, 120) }, "Migration step FAILED");
          failed++;
        }
      }
    }
    logger.info({ ok, failed }, "DB migrations complete");
  } finally {
    client.release();
  }
}
