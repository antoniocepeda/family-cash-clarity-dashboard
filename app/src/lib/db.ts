import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "family-cash.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    migrateLegacySchema(_db);
    initSchema(_db);
    migrate(_db);
  }
  return _db;
}

function migrateLegacySchema(db: Database.Database) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[];
  const tableNames = new Set(tables.map((t) => t.name));

  if (tableNames.has("events")) {
    db.pragma("foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS event_allocations");
    db.exec("DROP TABLE IF EXISTS event_instances");
    db.exec("DROP TABLE IF EXISTS event_history");

    // Drop the old ledger table since its FK columns reference old schema
    if (tableNames.has("ledger")) {
      const cols = db.prepare("PRAGMA table_info(ledger)").all() as { name: string }[];
      if (cols.some((c) => c.name === "event_id")) {
        db.exec("DROP TABLE IF EXISTS ledger");
      }
    }

    db.exec("DROP TABLE IF EXISTS events");
    db.pragma("foreign_keys = ON");
  }
}

function migrate(db: Database.Database) {
  const columns = db
    .prepare("PRAGMA table_info(commitments)")
    .all() as { name: string }[];
  const colNames = columns.map((c) => c.name);

  if (!colNames.includes("actual_amount")) {
    db.exec("ALTER TABLE commitments ADD COLUMN actual_amount REAL");
  }
  if (!colNames.includes("paid_date")) {
    db.exec("ALTER TABLE commitments ADD COLUMN paid_date TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS commitment_history (
      id TEXT PRIMARY KEY,
      commitment_id TEXT NOT NULL,
      amount REAL NOT NULL,
      actual_amount REAL NOT NULL,
      paid_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      FOREIGN KEY (commitment_id) REFERENCES commitments(id)
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
      commitment_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (commitment_id) REFERENCES commitments(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS commitment_instances (
      id TEXT PRIMARY KEY,
      commitment_id TEXT NOT NULL,
      due_date TEXT NOT NULL,
      planned_amount REAL NOT NULL,
      allocated_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','funded')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (commitment_id) REFERENCES commitments(id),
      UNIQUE(commitment_id, due_date)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS commitment_allocations (
      id TEXT PRIMARY KEY,
      ledger_id TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      commitment_id TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ledger_id) REFERENCES ledger(id),
      FOREIGN KEY (instance_id) REFERENCES commitment_instances(id),
      FOREIGN KEY (commitment_id) REFERENCES commitments(id)
    )
  `);

  const allocCols = db.prepare("PRAGMA table_info(commitment_allocations)").all() as { name: string }[];
  if (!allocCols.some((c) => c.name === "note")) {
    db.exec("ALTER TABLE commitment_allocations ADD COLUMN note TEXT");
  }
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

    CREATE TABLE IF NOT EXISTS commitments (
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

    CREATE TABLE IF NOT EXISTS commitment_history (
      id TEXT PRIMARY KEY,
      commitment_id TEXT NOT NULL,
      amount REAL NOT NULL,
      actual_amount REAL NOT NULL,
      paid_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      FOREIGN KEY (commitment_id) REFERENCES commitments(id)
    );

    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense','income')),
      account_id TEXT NOT NULL,
      commitment_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (commitment_id) REFERENCES commitments(id)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      severity TEXT NOT NULL CHECK(severity IN ('critical','warning','info')),
      message TEXT NOT NULL,
      action_text TEXT,
      commitment_id TEXT,
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
