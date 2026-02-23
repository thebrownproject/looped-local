import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export * from "./schema";
export * from "./queries";

const DB_PATH = process.env.DB_PATH ?? "looped.db";

let instance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (instance) return instance;

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  instance = drizzle(sqlite, { schema });
  return instance;
}
