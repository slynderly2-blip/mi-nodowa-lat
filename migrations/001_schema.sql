-- ═══════════════════════════════════════════════════════════════════
-- Nodowa Tienda v2 — Schema SQLite
-- Compatible con PostgreSQL (cambiar INTEGER AUTOINCREMENT → SERIAL,
-- TEXT → VARCHAR, datetime() → NOW())
-- ═══════════════════════════════════════════════════════════════════

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ─── USUARIOS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    UNIQUE NOT NULL COLLATE NOCASE,
  display_name  TEXT,
  password_hash TEXT,
  pin           TEXT,
  wallet        INTEGER NOT NULL DEFAULT 0,
  bank          INTEGER NOT NULL DEFAULT 0,
  linked        INTEGER NOT NULL DEFAULT 0,
  xuid          TEXT,
  avatar        TEXT,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_active   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_xuid     ON users(xuid);

-- ─── ITEMS DE TIENDA ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_items (
  id           TEXT PRIMARY KEY,
  name         TEXT    NOT NULL,
  category     TEXT    NOT NULL,
  price_coins  INTEGER NOT NULL DEFAULT 0,
  price_usdt   REAL    NOT NULL DEFAULT 0.0,
  description  TEXT,
  icon_type    TEXT    DEFAULT 'gem',
  command      TEXT,
  give_coins   INTEGER NOT NULL DEFAULT 0,
  badge        TEXT,
  enabled      INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_items_category ON store_items(category);
CREATE INDEX IF NOT EXISTS idx_items_enabled  ON store_items(enabled);

-- ─── ÓRDENES (compras con USDT/Binance) ──────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT    PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username      TEXT    NOT NULL,
  item_id       TEXT    REFERENCES store_items(id) ON DELETE SET NULL,
  item_title    TEXT,
  price_usdt    REAL,
  give_coins    INTEGER DEFAULT 0,
  command       TEXT,
  txid          TEXT,
  receipt_image TEXT,
  status        TEXT    NOT NULL DEFAULT 'PENDING'
                        CHECK(status IN ('PENDING','APPROVED','REJECTED')),
  admin_note    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  reviewed_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_username ON orders(username);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at);

-- ─── ENTREGAS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliveries (
  id             TEXT    PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username       TEXT    NOT NULL,
  item_title     TEXT,
  item_category  TEXT,
  command        TEXT,
  give_coins     INTEGER DEFAULT 0,
  price_coins    INTEGER DEFAULT 0,
  payment_method TEXT,
  source         TEXT,
  status         TEXT    NOT NULL DEFAULT 'PENDING'
                         CHECK(status IN ('PENDING','DELIVERED','FAILED')),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  delivered_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_deliveries_user_status ON deliveries(username, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_status      ON deliveries(status);

-- ─── TRANSACCIONES NC ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id         TEXT    PRIMARY KEY,
  from_user  TEXT    NOT NULL,
  to_user    TEXT    NOT NULL,
  amount     INTEGER NOT NULL,
  type       TEXT    NOT NULL,
  note       TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_from    ON transactions(from_user);
CREATE INDEX IF NOT EXISTS idx_tx_to      ON transactions(to_user);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);

-- ─── TOKENS DE VINCULACIÓN MINECRAFT ─────────────────────────────────
CREATE TABLE IF NOT EXISTS link_tokens (
  code          TEXT PRIMARY KEY,
  username      TEXT NOT NULL,
  session_token TEXT,
  expires_at    TEXT NOT NULL,
  used          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_link_user    ON link_tokens(username);
CREATE INDEX IF NOT EXISTS idx_link_expires ON link_tokens(expires_at);

-- ─── SESIONES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  username   TEXT    NOT NULL,
  is_admin   INTEGER DEFAULT 0,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ─── COMPROBANTES USDT ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  receipt_id    TEXT PRIMARY KEY,
  from_user     TEXT,
  to_user       TEXT,
  amount        REAL,
  status        TEXT,
  security_hash TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── MERCADO P2P ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS p2p_listings (
  id             TEXT    PRIMARY KEY,
  seller         TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  description    TEXT,
  price          INTEGER NOT NULL,
  quantity       INTEGER DEFAULT 1,
  item_type      TEXT,
  whatsapp_full  TEXT,
  seller_linked  INTEGER DEFAULT 0,
  seller_avatar  TEXT,
  status         TEXT    DEFAULT 'ACTIVE',
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_p2p_seller ON p2p_listings(seller);
CREATE INDEX IF NOT EXISTS idx_p2p_status ON p2p_listings(status);

-- ─── ISSUES DE ENTREGAS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_issues (
  id          TEXT PRIMARY KEY,
  delivery_id TEXT REFERENCES deliveries(id) ON DELETE SET NULL,
  player      TEXT,
  item_title  TEXT,
  command     TEXT,
  note        TEXT,
  status      TEXT DEFAULT 'pending',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── VALORACIONES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ratings (
  id          TEXT PRIMARY KEY,
  author      TEXT NOT NULL,
  target_user TEXT,
  type        TEXT,
  stars       INTEGER,
  comment     TEXT,
  status      TEXT DEFAULT 'approved',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── REPORTES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  reporter    TEXT,
  target_user TEXT,
  reason      TEXT,
  description TEXT,
  proof       TEXT,
  status      TEXT DEFAULT 'open',
  admin_note  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- ─── MENSAJES INTERNOS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id        TEXT PRIMARY KEY,
  from_user TEXT NOT NULL,
  to_user   TEXT NOT NULL,
  subject   TEXT,
  body      TEXT,
  action    TEXT,
  ref_id    TEXT,
  ref_type  TEXT,
  read_at   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user);

-- ─── AMIGOS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friend_requests (
  id         TEXT PRIMARY KEY,
  sender     TEXT NOT NULL,
  target     TEXT NOT NULL,
  status     TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS friends (
  user_a     TEXT NOT NULL,
  user_b     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_a, user_b)
);

-- ─── CONFIGURACIÓN GLOBAL ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO config (key, value) VALUES
  ('currency_name',   'Nodocoins'),
  ('currency_symbol', 'NC'),
  ('binance_pay_id',  '1255344898'),
  ('binance_wallet',  'USDT'),
  ('link_bonus_nc',   '500');
