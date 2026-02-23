// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  createConversation,
  listConversations,
  getConversationWithMessages,
  saveMessage,
  updateConversationTitle,
} from "./queries";

// Bootstrap an in-memory db with the schema applied directly (no migration files needed)
function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL,
      content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  return drizzle(sqlite);
}

type TestDb = ReturnType<typeof createTestDb>;

describe("Conversation CRUD", () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it("creates a conversation and returns it", () => {
    const conv = createConversation(db, "First chat");
    expect(conv.title).toBe("First chat");
    expect(conv.id).toBeTruthy();
    expect(typeof conv.createdAt).toBe("number");
  });

  it("lists conversations most recent first", async () => {
    createConversation(db, "Older");
    // Ensure distinct timestamps - SQLite orders by integer ms
    await new Promise((r) => setTimeout(r, 5));
    createConversation(db, "Newer");
    const list = listConversations(db);
    expect(list[0].title).toBe("Newer");
    expect(list[1].title).toBe("Older");
  });

  it("getConversationWithMessages returns conversation and empty messages", () => {
    const conv = createConversation(db, "Solo");
    const result = getConversationWithMessages(db, conv.id);
    expect(result?.conversation.title).toBe("Solo");
    expect(result?.messages).toHaveLength(0);
  });

  it("returns null for unknown conversation id", () => {
    const result = getConversationWithMessages(db, "nonexistent");
    expect(result).toBeNull();
  });

  it("updates conversation title", () => {
    const conv = createConversation(db, "Old title");
    updateConversationTitle(db, conv.id, "New title");
    const result = getConversationWithMessages(db, conv.id);
    expect(result?.conversation.title).toBe("New title");
  });
});

describe("Message CRUD", () => {
  let db: TestDb;
  let convId: string;

  beforeEach(() => {
    db = createTestDb();
    convId = createConversation(db, "Test conv").id;
  });

  it("saves a user message and retrieves it", () => {
    saveMessage(db, { conversationId: convId, role: "user", content: "hello" });
    const result = getConversationWithMessages(db, convId);
    expect(result?.messages).toHaveLength(1);
    expect(result?.messages[0].role).toBe("user");
    expect(result?.messages[0].content).toBe("hello");
  });

  it("messages are ordered by created_at ascending", () => {
    saveMessage(db, { conversationId: convId, role: "user", content: "first" });
    saveMessage(db, { conversationId: convId, role: "assistant", content: "second" });
    const { messages } = getConversationWithMessages(db, convId)!;
    expect(messages[0].content).toBe("first");
    expect(messages[1].content).toBe("second");
  });

  it("saves assistant message with null content", () => {
    saveMessage(db, { conversationId: convId, role: "assistant", content: null });
    const { messages } = getConversationWithMessages(db, convId)!;
    expect(messages[0].content).toBeNull();
  });
});

describe("tool_calls JSON serialization", () => {
  let db: TestDb;
  let convId: string;

  beforeEach(() => {
    db = createTestDb();
    convId = createConversation(db, "Tool conv").id;
  });

  it("serializes and deserializes tool_calls", () => {
    const toolCalls = [{ id: "call_1", name: "bash", arguments: '{"cmd":"ls"}' }];
    saveMessage(db, {
      conversationId: convId,
      role: "assistant",
      content: null,
      toolCalls,
    });
    const { messages } = getConversationWithMessages(db, convId)!;
    expect(messages[0].toolCalls).toEqual(toolCalls);
  });

  it("saves tool-result message with toolCallId", () => {
    saveMessage(db, {
      conversationId: convId,
      role: "tool",
      content: "file contents",
      toolCallId: "call_1",
    });
    const { messages } = getConversationWithMessages(db, convId)!;
    expect(messages[0].toolCallId).toBe("call_1");
  });
});

describe("Foreign key constraint", () => {
  it("rejects message with unknown conversation_id", () => {
    const db = createTestDb();
    expect(() => {
      saveMessage(db, {
        conversationId: "ghost-id",
        role: "user",
        content: "orphan",
      });
    }).toThrow();
  });
});
