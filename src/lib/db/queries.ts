import { eq, asc, desc } from "drizzle-orm";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { conversations, messages } from "./schema";
import type { ToolCall, MessageRole } from "@/lib/engine/types";

type Db = BetterSQLite3Database;

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
  return db
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
}

export function updateConversationTitle(db: Db, id: string, title: string) {
  db.update(conversations)
    .set({ title, updatedAt: Date.now() })
    .where(eq(conversations.id, id))
    .run();
}
