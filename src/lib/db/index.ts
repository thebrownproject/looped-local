import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export * from "./schema";
export * from "./queries";

const DB_PATH = process.env.DB_PATH ?? "looped.db";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;
const globalForDb = globalThis as unknown as { _loopedDb?: DbInstance };

export function getDb() {
  if (globalForDb._loopedDb) return globalForDb._loopedDb;

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  globalForDb._loopedDb = drizzle(sqlite, { schema });
  return globalForDb._loopedDb;
}
