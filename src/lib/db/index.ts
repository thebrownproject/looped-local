import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export * from "./schema";
export * from "./queries";

const DB_PATH = process.env.DB_PATH ?? "bashling.db";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;
const globalForDb = globalThis as unknown as { _bashlingDb?: DbInstance };

export function getDb() {
  if (globalForDb._bashlingDb) return globalForDb._bashlingDb;

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  globalForDb._bashlingDb = drizzle(sqlite, { schema });
  return globalForDb._bashlingDb;
}
