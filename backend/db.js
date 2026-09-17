const { DatabaseSync } = require("node:sqlite");
const path = require("path");

// Uses Node's built-in SQLite module (no native compilation / build tools
// required — unlike better-sqlite3, which needs Visual Studio on Windows).
// Available unflagged on Node 23.4+ / stable on Node 24+.
//
// SQLite file lives next to this module. On Render's free tier the
// filesystem is ephemeral (resets on every redeploy) — see README for
// how to swap this for a persistent disk or a hosted DB later.
const db = new DatabaseSync(path.join(__dirname, "raktsetu.db"));

db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS responders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('Blood','Medicine','Ambulance')),
    tag TEXT NOT NULL,
    blood_group TEXT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    available INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    -- JSON map e.g. {"O+": 12, "A+": 5, "AB-": 0}
    blood_stock TEXT NOT NULL DEFAULT '{}',
    medicine_stock INTEGER NOT NULL DEFAULT 0,
    available INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('Blood','Medicine','Ambulance')),
    blood_group TEXT,
    urgency TEXT NOT NULL,
    location_label TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Searching',
    fulfilled_by TEXT CHECK(fulfilled_by IN ('warehouse','network')),
    responder_id INTEGER,
    warehouse_id INTEGER,
    matched_at TEXT,
    delivered_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (responder_id) REFERENCES responders(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
  );

  -- ===== Storefront: users, OTP login, products, cart, orders =====

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Demo-only OTP store. No real SMS gateway is wired up — see README.
  CREATE TABLE IF NOT EXISTS otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    otp TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('Blood','Oxygen','Medicine')),
    subtype TEXT,                 -- e.g. blood group, cylinder size
    unit TEXT NOT NULL,           -- e.g. "unit (450ml)", "cylinder (40L)", "strip of 10"
    price REAL NOT NULL,          -- for Blood this is a processing+delivery fee, never a price for blood itself
    stock_qty INTEGER NOT NULL DEFAULT 0,
    icon TEXT,
    -- null = no verification needed; 'prescription' | 'hospital_reference' | 'id_proof'
    verification_type TEXT,
    eta_minutes INTEGER NOT NULL DEFAULT 20,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, product_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending Verification',
    -- Pending Verification -> Verified -> Dispatched -> Delivered  (or Rejected)
    total_amount REAL NOT NULL,
    delivery_location TEXT NOT NULL,
    needs_verification INTEGER NOT NULL DEFAULT 0,
    verification_note TEXT,      -- simulated reference: prescription ref / hospital ref / ID note
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    verified_at TEXT,
    delivered_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`);

module.exports = db;
