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
  // Auto-create tables if they don't exist (first run without migrations)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
  `);

  globalForDb._loopedDb = drizzle(sqlite, { schema });
  return globalForDb._loopedDb;
}
