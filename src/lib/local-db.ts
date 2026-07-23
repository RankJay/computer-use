import Database from "@tauri-apps/plugin-sql";

/** Single local-first SQLite file for chats, mandates, and Attempt ledger. */
export const LOCAL_DB_URL = "sqlite:chats.db";

let dbPromise: Promise<Database> | null = null;

/**
 * Open the app SQLite DB with WAL + busy_timeout (ops-contract / ADR 0007).
 * Shared by chats, mandates, and Attempt event store adapters.
 */
export function openLocalDb(): Promise<Database> {
  dbPromise ??= (async () => {
    const db = await Database.load(LOCAL_DB_URL);
    await db.execute("PRAGMA busy_timeout = 5000");
    await db.execute("PRAGMA journal_mode = WAL");
    return db;
  })();
  return dbPromise;
}

/** Test helper — reset the singleton between suites that mock Database. */
export function resetLocalDbForTests(): void {
  dbPromise = null;
}
