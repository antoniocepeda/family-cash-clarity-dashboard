import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "family-cash.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database) {
  const columns = db
    .prepare("PRAGMA table_info(events)")
    .all() as { name: string }[];
  const colNames = columns.map((c) => c.name);

  if (!colNames.includes("actual_amount")) {
    db.exec("ALTER TABLE events ADD COLUMN actual_amount REAL");
  }
  if (!colNames.includes("paid_date")) {
    db.exec("ALTER TABLE events ADD COLUMN paid_date TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS event_history (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      amount REAL NOT NULL,
      actual_amount REAL NOT NULL,
      paid_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense','income')),
      account_id TEXT NOT NULL,
      event_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('checking','savings','cash','credit')),
      current_balance REAL NOT NULL DEFAULT 0,
      is_reserve INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income','bill')),
      amount REAL NOT NULL,
      actual_amount REAL,
      due_date TEXT NOT NULL,
      recurrence_rule TEXT,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('critical','normal','flexible')),
      autopay INTEGER NOT NULL DEFAULT 0,
      account_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      paid INTEGER NOT NULL DEFAULT 0,
      paid_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS event_history (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      amount REAL NOT NULL,
      actual_amount REAL NOT NULL,
      paid_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense','income')),
      account_id TEXT NOT NULL,
      event_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      severity TEXT NOT NULL CHECK(severity IN ('critical','warning','info')),
      message TEXT NOT NULL,
      action_text TEXT,
      event_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS projection_snapshots (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      projected_balance REAL NOT NULL,
      account_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
