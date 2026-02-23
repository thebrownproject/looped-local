import { eq, asc, desc } from "drizzle-orm";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { conversations, messages } from "./schema";
import type { ToolCall, MessageRole } from "@/lib/engine/types";

// Accept any Drizzle/BetterSQLite3 instance regardless of schema type parameter
type Db = BetterSQLite3Database<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function createConversation(db: Db, title: string) {
  const now = Date.now();
  const id = crypto.randomUUID();
  return db
    .insert(conversations)
    .values({ id, title, createdAt: now, updatedAt: now })
    .returning()
    .get();
}

export function listConversations(db: Db) {
  return db.select().from(conversations).orderBy(desc(conversations.createdAt)).all();
}

export function getConversation(db: Db, id: string) {
  return db.select().from(conversations).where(eq(conversations.id, id)).get() ?? null;
}

export function getConversationWithMessages(db: Db, id: string) {
  const conv = db.select().from(conversations).where(eq(conversations.id, id)).get();
  if (!conv) return null;

  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt))
    .all();

  return {
    conversation: conv,
    messages: rows.map((m) => ({
      ...m,
      toolCalls: m.toolCalls ? (JSON.parse(m.toolCalls) as ToolCall[]) : undefined,
    })),
  };
}

export interface SaveMessageInput {
  conversationId: string;
  role: MessageRole;
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export function saveMessage(db: Db, input: SaveMessageInput) {
  const id = crypto.randomUUID();
  // Date.now() can collide within the same ms; ordering relies on insert sequence
  const row = db
    .insert(messages)
    .values({
      id,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content ?? null,
      toolCalls: input.toolCalls ? JSON.stringify(input.toolCalls) : null,
      toolCallId: input.toolCallId ?? null,
      createdAt: Date.now(),
    })
    .returning()
    .get();

  return {
    ...row,
    toolCalls: row.toolCalls
      ? (JSON.parse(row.toolCalls) as ToolCall[])
      : null,
  };
}

export function updateConversationTitle(db: Db, id: string, title: string) {
  const result = db
    .update(conversations)
    .set({ title, updatedAt: Date.now() })
    .where(eq(conversations.id, id))
    .run();
  return result.changes;
}

export function deleteConversation(db: Db, id: string): boolean {
  let deleted = false;
  db.transaction((tx) => {
    tx.delete(messages).where(eq(messages.conversationId, id)).run();
    const result = tx.delete(conversations).where(eq(conversations.id, id)).run();
    deleted = result.changes > 0;
  });
  return deleted;
}
