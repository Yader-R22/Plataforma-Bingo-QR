-- =============================================================================
-- Tu Bingazo — Script de migración para VPS
-- Seguro de ejecutar varias veces (idempotente).
-- Agregar columnas faltantes y crear tablas nuevas sin tocar datos existentes.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: users — columnas agregadas después del deploy inicial
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_photo_front        TEXT,
  ADD COLUMN IF NOT EXISTS reset_photo_back         TEXT,
  ADD COLUMN IF NOT EXISTS reset_photo_selfie       TEXT,
  ADD COLUMN IF NOT EXISTS needs_ci_upload          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason         TEXT,
  ADD COLUMN IF NOT EXISTS must_change_password     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temp_password_display    TEXT,
  ADD COLUMN IF NOT EXISTS temp_password_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bonus_balance            NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_expires_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_credit_balance     NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referred_by_code         TEXT,
  ADD COLUMN IF NOT EXISTS is_banned                BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_reason               TEXT,
  ADD COLUMN IF NOT EXISTS admin_permissions        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS last_known_ip            TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: games — columnas agregadas después del deploy inicial
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS rounds                   JSONB,
  ADD COLUMN IF NOT EXISTS current_round            INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS round_history            JSONB,
  ADD COLUMN IF NOT EXISTS slug                     TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url          TEXT,
  ADD COLUMN IF NOT EXISTS prize_type               TEXT NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS prize_physical_name      TEXT,
  ADD COLUMN IF NOT EXISTS prize_physical_description TEXT,
  ADD COLUMN IF NOT EXISTS prize_image_url          TEXT,
  ADD COLUMN IF NOT EXISTS is_featured              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_private               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prizes                   JSONB DEFAULT '[]'::JSONB;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: cards — columnas agregadas después del deploy inicial
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS bonus_amount_used        NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_credit_amount_used NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_predefined            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS predefined_round         INTEGER;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: winners — columnas agregadas después del deploy inicial
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE winners
  ADD COLUMN IF NOT EXISTS round                    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS place                    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_historical            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_notes              TEXT,
  ADD COLUMN IF NOT EXISTS prize_type               TEXT,
  ADD COLUMN IF NOT EXISTS prize_physical_name      TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status          TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address         TEXT,
  ADD COLUMN IF NOT EXISTS delivery_phone           TEXT,
  ADD COLUMN IF NOT EXISTS delivery_receipt_url     TEXT,
  ADD COLUMN IF NOT EXISTS delivery_notes           TEXT;

-- Índice único para winners (card_id, round) — idempotente
CREATE UNIQUE INDEX IF NOT EXISTS winners_card_round_uniq ON winners (card_id, round);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: withdrawals — columnas agregadas después del deploy inicial
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS bank_qr_url              TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_info        TEXT,
  ADD COLUMN IF NOT EXISTS notes                    TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_url        TEXT,
  ADD COLUMN IF NOT EXISTS withdrawal_pin           TEXT,
  ADD COLUMN IF NOT EXISTS paid_at                  TIMESTAMPTZ;

-- Ampliar el enum method de withdrawals para incluir nuevos métodos
DO $$
BEGIN
  ALTER TABLE withdrawals ALTER COLUMN method TYPE TEXT;
EXCEPTION WHEN others THEN NULL;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: banners — puede no existir o faltarle columnas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banners (
  id            SERIAL PRIMARY KEY,
  image_url     TEXT NOT NULL,
  media_type    TEXT NOT NULL DEFAULT 'image',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE banners ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image';

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: push_subscriptions — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: feed_items — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feed_items (
  id                SERIAL PRIMARY KEY,
  type              TEXT NOT NULL,
  message           TEXT NOT NULL,
  amount            NUMERIC(10,2),
  user_display_name TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: site_settings — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
  id                       SERIAL PRIMARY KEY,
  site_name                TEXT NOT NULL DEFAULT 'Tu Bingazo',
  site_tagline             TEXT NOT NULL DEFAULT 'Bingo en Vivo Bolivia',
  site_emoji               TEXT NOT NULL DEFAULT '🎱',
  favicon_url              TEXT,
  logo_url                 TEXT,
  seo_title                TEXT NOT NULL DEFAULT 'Tu Bingazo — Bingo en Vivo Bolivia',
  seo_description          TEXT NOT NULL DEFAULT 'La plataforma de bingo en vivo más grande de Bolivia.',
  seo_keywords             TEXT NOT NULL DEFAULT 'bingo, bolivia, bingo en vivo, premios, dinero',
  primary_color            TEXT NOT NULL DEFAULT '#1a0050',
  qr_background_url        TEXT,
  banner_interval          INTEGER NOT NULL DEFAULT 5,
  banner_version           INTEGER NOT NULL DEFAULT 1,
  support_whatsapp         TEXT,
  payment_api_key          TEXT,
  pwa_short_name           TEXT NOT NULL DEFAULT 'Bingazo',
  pwa_cache_version        INTEGER NOT NULL DEFAULT 1,
  pwa_icon_url             TEXT,
  pwa_icon_192_url         TEXT,
  pwa_display_mode         TEXT NOT NULL DEFAULT 'standalone',
  pwa_orientation          TEXT NOT NULL DEFAULT 'portrait',
  pwa_theme_color          TEXT,
  pwa_bg_color             TEXT,
  pwa_start_url            TEXT NOT NULL DEFAULT '/',
  pwa_categories           TEXT NOT NULL DEFAULT 'games,entertainment',
  terms_and_conditions     TEXT,
  og_image_url             TEXT,
  fallback_qr_image_url    TEXT,
  fallback_qr_force_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_id            INTEGER REFERENCES users(id)
);
-- Si ya existe, agregar columnas nuevas
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS pwa_short_name            TEXT NOT NULL DEFAULT 'Bingazo',
  ADD COLUMN IF NOT EXISTS pwa_cache_version         INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pwa_icon_url              TEXT,
  ADD COLUMN IF NOT EXISTS pwa_icon_192_url          TEXT,
  ADD COLUMN IF NOT EXISTS pwa_display_mode          TEXT NOT NULL DEFAULT 'standalone',
  ADD COLUMN IF NOT EXISTS pwa_orientation           TEXT NOT NULL DEFAULT 'portrait',
  ADD COLUMN IF NOT EXISTS pwa_theme_color           TEXT,
  ADD COLUMN IF NOT EXISTS pwa_bg_color              TEXT,
  ADD COLUMN IF NOT EXISTS pwa_start_url             TEXT NOT NULL DEFAULT '/',
  ADD COLUMN IF NOT EXISTS pwa_categories            TEXT NOT NULL DEFAULT 'games,entertainment',
  ADD COLUMN IF NOT EXISTS terms_and_conditions      TEXT,
  ADD COLUMN IF NOT EXISTS og_image_url              TEXT,
  ADD COLUMN IF NOT EXISTS fallback_qr_image_url     TEXT,
  ADD COLUMN IF NOT EXISTS fallback_qr_force_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS support_whatsapp          TEXT,
  ADD COLUMN IF NOT EXISTS payment_api_key           TEXT,
  ADD COLUMN IF NOT EXISTS qr_background_url         TEXT,
  ADD COLUMN IF NOT EXISTS site_tagline              TEXT NOT NULL DEFAULT 'Bingo en Vivo Bolivia',
  ADD COLUMN IF NOT EXISTS site_emoji                TEXT NOT NULL DEFAULT '🎱',
  ADD COLUMN IF NOT EXISTS favicon_url               TEXT,
  ADD COLUMN IF NOT EXISTS logo_url                  TEXT,
  ADD COLUMN IF NOT EXISTS seo_title                 TEXT NOT NULL DEFAULT 'Tu Bingazo — Bingo en Vivo Bolivia',
  ADD COLUMN IF NOT EXISTS seo_description           TEXT NOT NULL DEFAULT 'La plataforma de bingo en vivo más grande de Bolivia.',
  ADD COLUMN IF NOT EXISTS seo_keywords              TEXT NOT NULL DEFAULT 'bingo, bolivia, bingo en vivo, premios, dinero',
  ADD COLUMN IF NOT EXISTS primary_color             TEXT NOT NULL DEFAULT '#1a0050',
  ADD COLUMN IF NOT EXISTS banner_interval           INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS banner_version            INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by_id             INTEGER REFERENCES users(id);

-- Seed inicial si la tabla está vacía
INSERT INTO site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: game_categories — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_categories (
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
);
-- Seed de categorías base
INSERT INTO game_categories (type, label, emoji, sort_order) VALUES
  ('daily',   'Diario',   '🎱', 0),
  ('weekly',  'Semanal',  '🏆', 1),
  ('monthly', 'Mensual',  '👑', 2)
ON CONFLICT (type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: name_change_requests — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS name_change_requests (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  requested_name TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  admin_notes    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: referral_codes — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_codes (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  code       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: referral_transactions — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_transactions (
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
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: activator_requests — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activator_requests (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending',
  notes           TEXT,
  reviewed_by_id  INTEGER REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: activator_settings — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activator_settings (
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
);
INSERT INTO activator_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: activator_card_sales — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activator_card_sales (
  id                  SERIAL PRIMARY KEY,
  activator_user_id   INTEGER NOT NULL REFERENCES users(id),
  target_user_id      INTEGER NOT NULL REFERENCES users(id),
  game_id             INTEGER NOT NULL REFERENCES games(id),
  quantity            INTEGER NOT NULL,
  original_price      NUMERIC(10,2) NOT NULL,
  discount_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  final_price         NUMERIC(10,2) NOT NULL,
  payment_method      TEXT NOT NULL,
  checkout_id         TEXT,
  receipt_url         TEXT,
  card_ids            TEXT,
  status              TEXT NOT NULL DEFAULT 'pending_payment',
  admin_notes         TEXT,
  reviewed_by_id      INTEGER REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: partners y partner_payments — tablas nuevas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partners (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  identifier        TEXT,
  phone             TEXT,
  share_percentage  NUMERIC(5,2) NOT NULL,
  notes             TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_payments (
  id                 SERIAL PRIMARY KEY,
  period_label       TEXT NOT NULL,
  period_from        TIMESTAMPTZ NOT NULL,
  period_to          TIMESTAMPTZ NOT NULL,
  gross_revenue      NUMERIC(10,2) NOT NULL,
  net_profit         NUMERIC(10,2) NOT NULL,
  total_paid         NUMERIC(10,2) NOT NULL,
  partners_snapshot  JSONB NOT NULL DEFAULT '[]'::JSONB,
  finance_snapshot   JSONB,
  admin_notes        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: operating_expenses — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operating_expenses (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  amount     NUMERIC(10,2) NOT NULL,
  frequency  TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: ci_change_requests — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ci_change_requests (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  current_ci     TEXT NOT NULL,
  requested_ci   TEXT NOT NULL,
  photo_front_url TEXT,
  photo_back_url TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  admin_notes    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: manual_payment_requests — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manual_payment_requests (
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
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: game_authorized_activators — tabla nueva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_authorized_activators (
  id                 SERIAL PRIMARY KEY,
  game_id            INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  activator_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: audit_logs — columnas que pueden faltar
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- =============================================================================
-- FIN DEL SCRIPT — ejecutar con:
--   psql $DATABASE_URL -f migrate-vps.sql
-- =============================================================================
