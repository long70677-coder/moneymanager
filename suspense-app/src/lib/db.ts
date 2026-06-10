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
    migrateSchema(db);
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
      import_file_name TEXT,
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
      import_seq INTEGER DEFAULT 1,
      file_name TEXT,
      memo TEXT,
      is_reviewed INTEGER DEFAULT 0,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_by TEXT DEFAULT 'System',
      created_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT DEFAULT 'System',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(balance_date, account_code, currency, import_seq),
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

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_code TEXT UNIQUE NOT NULL,
      user_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'STAFF',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS account_managers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      manager_type TEXT NOT NULL DEFAULT 'PRIMARY',
      valid_from TEXT,
      valid_to TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(account_code, user_id, manager_type),
      FOREIGN KEY (account_code) REFERENCES bank_accounts(account_code),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- FUN2.1.1 轉檔：銀行格式設定檔（鍵=銀行+幣別，幣別可用 ZZZ 共用）
    CREATE TABLE IF NOT EXISTS bank_format_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_code TEXT NOT NULL,
      currency TEXT NOT NULL,
      profile_name TEXT,
      engine TEXT NOT NULL DEFAULT 'DELIMITED',
      encoding TEXT DEFAULT 'UTF-8',
      delimiter TEXT DEFAULT ',',
      has_header INTEGER DEFAULT 1,
      skip_rows INTEGER DEFAULT 0,
      sheet_name TEXT,
      column_map TEXT NOT NULL,
      date_format TEXT,
      amount_format TEXT,
      currency_map TEXT,
      version INTEGER DEFAULT 1,
      effective_date TEXT,
      status TEXT DEFAULT 'ACTIVE',
      is_reviewed INTEGER DEFAULT 0,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_by TEXT DEFAULT 'System',
      created_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT DEFAULT 'System',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(bank_code, currency, version)
    );

    -- FUN2.1.1 轉檔：轉檔歷程檔
    CREATE TABLE IF NOT EXISTS import_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      file_name TEXT,
      account_code TEXT,
      profile_id INTEGER,
      balance_date TEXT,
      total_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'SUCCESS',
      errors TEXT,
      uploaded_by TEXT DEFAULT 'System',
      uploaded_at TEXT DEFAULT (datetime('now'))
    );

    -- FUN2.1.1/結帳：帳列餘額檔（本日結餘，由結帳流程供應，此處唯讀消費）
    CREATE TABLE IF NOT EXISTS ledger_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      balance_date TEXT NOT NULL,
      account_code TEXT NOT NULL,
      currency TEXT NOT NULL,
      balance REAL DEFAULT 0,
      is_closed INTEGER DEFAULT 0,
      closed_at TEXT,
      created_by TEXT DEFAULT 'System',
      created_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT DEFAULT 'System',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(balance_date, account_code, currency),
      FOREIGN KEY (account_code) REFERENCES bank_accounts(account_code)
    );
  `);
}

/**
 * 既有 DB 的平滑升級（idempotent）。
 * - bank_accounts.import_file_name 缺欄則補。
 * - passbook_balances 缺 import_seq 則重建（含新唯一鍵 +import_seq），保留既有資料設 seq=1。
 * 三張新表由 initSchema 的 CREATE IF NOT EXISTS 處理，無需在此遷移。
 */
function migrateSchema(db: Database.Database) {
  const hasCol = (table: string, col: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(c => c.name === col);

  if (!hasCol("bank_accounts", "import_file_name")) {
    db.exec("ALTER TABLE bank_accounts ADD COLUMN import_file_name TEXT");
  }

  if (!hasCol("passbook_balances", "import_seq")) {
    // SQLite 無法 ALTER 既有 UNIQUE 約束 → 重建表。暫關 FK 以利 rename/drop。
    db.pragma("foreign_keys = OFF");
    db.exec(`
      ALTER TABLE passbook_balances RENAME TO passbook_balances_old;
      CREATE TABLE passbook_balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        balance_date TEXT NOT NULL,
        account_code TEXT NOT NULL,
        currency TEXT NOT NULL,
        balance REAL DEFAULT 0,
        data_type TEXT DEFAULT 'PREV_DAY',
        import_seq INTEGER DEFAULT 1,
        file_name TEXT,
        memo TEXT,
        is_reviewed INTEGER DEFAULT 0,
        reviewed_by TEXT,
        reviewed_at TEXT,
        created_by TEXT DEFAULT 'System',
        created_at TEXT DEFAULT (datetime('now')),
        updated_by TEXT DEFAULT 'System',
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(balance_date, account_code, currency, import_seq),
        FOREIGN KEY (account_code) REFERENCES bank_accounts(account_code)
      );
      INSERT INTO passbook_balances
        (id, balance_date, account_code, currency, balance, data_type, import_seq,
         file_name, memo, is_reviewed, reviewed_by, reviewed_at,
         created_by, created_at, updated_by, updated_at)
      SELECT id, balance_date, account_code, currency, balance, data_type, 1,
         file_name, memo, is_reviewed, reviewed_by, reviewed_at,
         created_by, created_at, updated_by, updated_at
      FROM passbook_balances_old;
      DROP TABLE passbook_balances_old;
    `);
    db.pragma("foreign_keys = ON");
  }
}

/**
 * 取得使用者可存取的帳號短碼清單。
 * - 主管（MANAGER）回傳 null，代表「全部帳號」不加任何過濾。
 * - 經辦（STAFF）回傳其主辦/代理且於 refDate 仍有效的帳號短碼陣列。
 * - 查無使用者回傳空陣列（看不到任何帳號）。
 */
export function getAccessibleAccountCodes(
  db: Database.Database,
  userId: number,
  refDate?: string
): string[] | null {
  const user = db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as { role: string } | undefined;
  if (!user) return [];
  if (user.role === "MANAGER") return null;

  const ref = refDate || new Date().toISOString().split("T")[0];
  const rows = db.prepare(`
    SELECT DISTINCT account_code FROM account_managers
    WHERE user_id = ?
      AND (valid_from IS NULL OR valid_from <= ?)
      AND (valid_to   IS NULL OR valid_to   >= ?)
  `).all(userId, ref, ref) as Array<{ account_code: string }>;
  return rows.map(r => r.account_code);
}

export function seedData(db: Database.Database) {
  // 使用者與帳號權限（獨立 seed，既有 DB 也會補齊）
  const userCount = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };
  if (userCount.cnt === 0) {
    const insertUser = db.prepare("INSERT OR IGNORE INTO users (user_code, user_name, role) VALUES (?, ?, ?)");
    const insertManager = db.prepare(`
      INSERT OR IGNORE INTO account_managers (account_code, user_id, manager_type, valid_from, valid_to)
      VALUES (?, (SELECT id FROM users WHERE user_code = ?), ?, ?, ?)
    `);
    db.transaction(() => {
      insertUser.run("U001", "王小明", "STAFF");
      insertUser.run("U002", "李美華", "STAFF");
      insertUser.run("U003", "陳主管", "MANAGER");

      // 主辦（PRIMARY，永久有效）
      insertManager.run("ACT-001", "U001", "PRIMARY", null, null);
      insertManager.run("ACT-002", "U001", "PRIMARY", null, null);
      insertManager.run("ACT-089", "U002", "PRIMARY", null, null);
      insertManager.run("ACT-102", "U002", "PRIMARY", null, null);
      insertManager.run("ACT-103", "U002", "PRIMARY", null, null);
      // 代理（AGENT，限期有效）：王小明代理李美華的 ACT-089
      insertManager.run("ACT-089", "U001", "AGENT", "2023-10-01", "2023-12-31");
    })();
  }

  const accountCount = db.prepare("SELECT COUNT(*) as cnt FROM bank_accounts").get() as { cnt: number };
  if (accountCount.cnt === 0) {

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

  seedImportConfig(db);
}

/**
 * FUN2.1.1 轉檔 demo 設定（idempotent，既有 DB 也會補）：
 * - 帳號檔名 import_file_name（一檔一帳號）
 * - 銀行格式 profile（DELIMITED）
 * - 帳列餘額 ledger_balances（結帳流程未實作前的測試資料）
 */
function seedImportConfig(db: Database.Database) {
  // 帳號檔名：缺者補（demo 以「帳號短碼.csv」為檔名）
  db.prepare("UPDATE bank_accounts SET import_file_name = account_code || '.csv' WHERE import_file_name IS NULL").run();

  // 銀行格式 profile：以欄名對應
  const profCount = db.prepare("SELECT COUNT(*) as cnt FROM bank_format_profiles").get() as { cnt: number };
  if (profCount.cnt === 0) {
    const columnMap = JSON.stringify({
      balanceDate: { by: "name", key: "餘額日期" },
      accountCode: { by: "name", key: "帳號" },
      currency: { by: "name", key: "幣別" },
      balance: { by: "name", key: "餘額" },
    });
    const insertProfile = db.prepare(`
      INSERT OR IGNORE INTO bank_format_profiles
        (bank_code, currency, profile_name, engine, encoding, delimiter, has_header, skip_rows, column_map, date_format, status)
      VALUES (?, ?, ?, 'DELIMITED', 'UTF-8', ',', 1, 0, ?, 'YYYY-MM-DD', 'ACTIVE')
    `);
    db.transaction(() => {
      insertProfile.run("012", "NTD", "第一銀行 台幣餘額檔", columnMap);
      insertProfile.run("013", "NTD", "華南銀行 台幣餘額檔", columnMap);
      insertProfile.run("012", "ZZZ", "第一銀行 外幣餘額檔（共用）", columnMap);
    })();
  }

  // 帳列餘額（本日結餘）：結帳流程未實作前先 seed 前一營業日資料供畫面顯示
  const ledgerCount = db.prepare("SELECT COUNT(*) as cnt FROM ledger_balances").get() as { cnt: number };
  if (ledgerCount.cnt === 0) {
    const insertLedger = db.prepare(`
      INSERT OR IGNORE INTO ledger_balances (balance_date, account_code, currency, balance, is_closed, closed_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
    `);
    db.transaction(() => {
      insertLedger.run("2023-10-26", "ACT-001", "NTD", 1250000);
      insertLedger.run("2023-10-26", "ACT-002", "NTD", 3450000);
      insertLedger.run("2023-10-26", "ACT-089", "NTD", 500000);
    })();
  }
}
