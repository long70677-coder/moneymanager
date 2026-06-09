import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "suspense.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const fs = require("fs");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT UNIQUE NOT NULL,
      account_long_code TEXT NOT NULL,
      bank_code TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_purpose TEXT NOT NULL,
      is_suspense INTEGER DEFAULT 1,
      is_policy_account INTEGER DEFAULT 0,
      currency_type TEXT DEFAULT 'TWD',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS passbook_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      balance_date TEXT NOT NULL,
      account_code TEXT NOT NULL,
      currency TEXT NOT NULL,
      balance REAL DEFAULT 0,
      data_type TEXT DEFAULT 'PREV_DAY',
      file_name TEXT,
      memo TEXT,
      is_reviewed INTEGER DEFAULT 0,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_by TEXT DEFAULT 'System',
      created_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT DEFAULT 'System',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(balance_date, account_code, currency),
      FOREIGN KEY (account_code) REFERENCES bank_accounts(account_code)
    );

    CREATE TABLE IF NOT EXISTS suspense_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_no TEXT UNIQUE NOT NULL,
      suspense_date TEXT NOT NULL,
      suspense_type TEXT NOT NULL,
      batch_no TEXT NOT NULL,
      bank_code TEXT NOT NULL,
      account_code TEXT NOT NULL,
      currency TEXT NOT NULL,
      prev_company_balance REAL DEFAULT 0,
      prev_passbook_balance REAL DEFAULT 0,
      today_company_balance REAL DEFAULT 0,
      today_passbook_balance REAL DEFAULT 0,
      total_suspense_amount REAL DEFAULT 0,
      suspense_amount REAL DEFAULT 0,
      exchange_rate REAL DEFAULT 1,
      suspense_amount_local REAL DEFAULT 0,
      is_confirmed INTEGER DEFAULT 0,
      is_day_closed INTEGER DEFAULT 0,
      is_report_locked INTEGER DEFAULT 0,
      created_by TEXT DEFAULT 'System',
      created_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT DEFAULT 'System',
      updated_at TEXT DEFAULT (datetime('now')),
      version INTEGER DEFAULT 0,
      UNIQUE(suspense_date, suspense_type, currency, batch_no, account_code),
      FOREIGN KEY (account_code) REFERENCES bank_accounts(account_code)
    );

    CREATE TABLE IF NOT EXISTS batch_confirmations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suspense_date TEXT NOT NULL,
      currency TEXT NOT NULL,
      batch_type TEXT NOT NULL,
      batch_no TEXT NOT NULL,
      confirm_status TEXT DEFAULT 'UNCONFIRMED',
      confirmed_by TEXT,
      confirmed_at TEXT,
      cancelled_by TEXT,
      cancelled_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      version INTEGER DEFAULT 0,
      UNIQUE(suspense_date, currency, batch_type, batch_no)
    );

    CREATE TABLE IF NOT EXISTS voucher_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_no TEXT NOT NULL,
      suspense_date TEXT NOT NULL,
      batch_no TEXT NOT NULL,
      batch_type TEXT NOT NULL,
      account_code TEXT NOT NULL,
      currency TEXT NOT NULL,
      debit_credit TEXT NOT NULL,
      accounting_code TEXT NOT NULL,
      amount REAL NOT NULL,
      amount_local REAL NOT NULL,
      summary TEXT NOT NULL,
      created_by TEXT DEFAULT 'System',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS report_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suspense_date TEXT NOT NULL,
      batch_no TEXT NOT NULL,
      account_code TEXT NOT NULL,
      currency TEXT NOT NULL,
      item_code TEXT NOT NULL,
      debit_credit TEXT DEFAULT 'D',
      amount REAL NOT NULL,
      report_source TEXT DEFAULT '5',
      created_by TEXT DEFAULT 'System',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sequence_counters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      counter_key TEXT UNIQUE NOT NULL,
      current_value INTEGER DEFAULT 0
    );
  `);
}

export function seedData(db: Database.Database) {
  const accountCount = db.prepare("SELECT COUNT(*) as cnt FROM bank_accounts").get() as { cnt: number };
  if (accountCount.cnt > 0) return;

  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO bank_accounts (account_code, account_long_code, bank_code, account_name, account_purpose, is_suspense, is_policy_account, currency_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const accounts = [
    ["ACT-001", "012-0001-00001-001", "012", "台幣暫收帳戶A", "General Suspense", 1, 0, "TWD"],
    ["ACT-002", "012-0001-00001-002", "012", "台幣暫收帳戶B", "Settlement Suspense", 1, 0, "TWD"],
    ["ACT-089", "013-0089-00089-001", "013", "清算差額暫收帳戶", "Clearing Discrepancy", 1, 0, "TWD"],
    ["ACT-102", "012-0102-00102-001", "012", "外幣匯款暫收帳戶", "Foreign Remittance", 1, 0, "FOREIGN"],
    ["ACT-103", "012-0103-00103-001", "012", "外幣保單暫收帳戶", "Foreign Policy Suspense", 1, 1, "FOREIGN"],
  ];

  const insertBalance = db.prepare(`
    INSERT OR IGNORE INTO passbook_balances (balance_date, account_code, currency, balance, data_type, is_reviewed, reviewed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const balances = [
    ["2023-10-26", "ACT-001", "NTD", 1250000, "FILE_IMPORT", 1, "Admin"],
    ["2023-10-26", "ACT-002", "NTD", 3500000, "FILE_IMPORT", 1, "Admin"],
    ["2023-10-26", "ACT-089", "NTD", 500000, "FILE_IMPORT", 1, "Admin"],
    ["2023-10-26", "ACT-102", "USD", 25000, "FILE_IMPORT", 1, "Admin"],
    ["2023-10-26", "ACT-103", "USD", 10000, "FILE_IMPORT", 1, "Admin"],
  ];

  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO suspense_transactions
    (transaction_no, suspense_date, suspense_type, batch_no, bank_code, account_code, currency,
     prev_company_balance, prev_passbook_balance, today_company_balance, today_passbook_balance,
     total_suspense_amount, suspense_amount, exchange_rate, suspense_amount_local, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const txs = [
    ["ST-20231027-001-001", "2023-10-27", "DAILY", "20231027001", "012", "ACT-001", "NTD", 1250000, 1250000, 1250000, 1250000, 0, 0, 1, 0, "J.Smith"],
    ["ST-20231027-001-002", "2023-10-27", "MANUAL", "20231027001", "013", "ACT-089", "NTD", 500000, 500000, 450000, 500000, 50000, 50000, 1, 50000, "M.Chen"],
    ["ST-20231027-001-003", "2023-10-27", "DAILY", "20231027001", "012", "ACT-102", "USD", 25000, 25000, 25000, 25000, 0, 0, 31.5, 0, "System"],
  ];

  const insertMany = db.transaction(() => {
    for (const a of accounts) insertAccount.run(...a);
    for (const b of balances) insertBalance.run(...b);
    for (const t of txs) insertTx.run(...t);

    db.prepare(`
      INSERT OR IGNORE INTO batch_confirmations (suspense_date, currency, batch_type, batch_no, confirm_status)
      VALUES ('2023-10-27', 'NTD', 'DAILY', '20231027001', 'UNCONFIRMED')
    `).run();

    db.prepare(`
      INSERT OR IGNORE INTO sequence_counters (counter_key, current_value)
      VALUES ('BATCH_DAILY_20231027_NTD', 1)
    `).run();
  });

  insertMany();
}
