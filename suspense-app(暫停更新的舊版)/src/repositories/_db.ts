import type BetterSqlite3 from "better-sqlite3";

/** Repository 層共用的 DB 連線型別（better-sqlite3 同步連線實例）。 */
export type DB = BetterSqlite3.Database;
