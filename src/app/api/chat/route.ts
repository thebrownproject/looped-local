import { NextRequest } from "next/server";
import { OllamaProvider } from "@/lib/providers";
import { createDefaultRegistry } from "@/lib/tools";
import { runLoop } from "@/lib/engine";
import type { Message, MessageRole } from "@/lib/engine";
import { loopToSSEStream } from "@/lib/engine/adapters";
import { getDb, createConversation, getConversation, saveMessage } from "@/lib/db";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

const VALID_ROLES = new Set<MessageRole>(["system", "user", "assistant", "tool"]);

function isValidMessage(m: unknown): m is Message {
  if (typeof m !== "object" || m === null) return false;
  const obj = m as Record<string, unknown>;
  return (
    typeof obj.role === "string" &&
    VALID_ROLES.has(obj.role as MessageRole) &&
    (typeof obj.content === "string" || obj.content === null || obj.content === undefined)
  );
}

export async function POST(req: NextRequest) {
  let body: { messages?: unknown[]; conversationId?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages: rawMessages, conversationId, model = "qwen2.5-coder" } = body;

  if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
    return Response.json({ error: "messages is required" }, { status: 400 });
  }

  // Bug 5: validate each message has correct shape
  if (!rawMessages.every(isValidMessage)) {
    return Response.json(
      { error: "Each message must have a valid role and content (string or null)" },
      { status: 400 },
    );
  }

  const messages: Message[] = rawMessages;
  const db = getDb();

  // Bug 3: validate conversationId exists if provided
  if (conversationId && !getConversation(db, conversationId)) {
    return Response.json({ error: "Conversation not found" }, { status: 400 });
  }

  // Bug 8: find last user message instead of assuming last element
  const userMessage = [...messages].reverse().find((m) => m.role === "user");

  // Use the user's message content for the conversation title, not messages[0]
  // which could be a non-user role or have null content
  const convId =
    conversationId ||
    createConversation(db, userMessage?.content?.slice(0, 60) || "New chat").id;

  // Bug 6: wrap saveMessage in try/catch
  if (userMessage) {
    try {
      saveMessage(db, {
        conversationId: convId,
        role: userMessage.role,
        content: userMessage.content,
        toolCalls: userMessage.toolCalls,
        toolCallId: userMessage.toolCallId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ error: `Failed to save message: ${msg}` }, { status: 500 });
    }
  }

  const provider = new OllamaProvider({ model });
  const registry = createDefaultRegistry();

  let assistantContent = "";

  async function* tracked(): AsyncGenerator<import("@/lib/engine").LoopEvent> {
    yield { type: "conversation", conversationId: convId };
    const gen = runLoop({ provider, registry, config: { model, maxIterations: 20 }, messages });
    for await (const event of gen) {
      // Accumulate from text_delta (streaming); text is the compat terminal event, skip to avoid double-counting
      if (event.type === "text_delta") assistantContent += event.content;

      // Reset accumulated text when tool calls arrive -- pre-tool-call text
      // belongs to that iteration, not the final response
      if (event.type === "tool_call") assistantContent = "";

      // Persist intermediate tool_call and tool_result messages
      // Wrap DB writes in try/catch so failures don't kill the stream
      try {
        if (event.type === "tool_call") {
          saveMessage(db, {
            conversationId: convId,
            role: "assistant",
            content: null,
            toolCalls: [event.call],
          });
        }
        if (event.type === "tool_result") {
          saveMessage(db, {
            conversationId: convId,
            role: "tool",
            content: event.result,
            toolCallId: event.callId,
          });
        }
        if (event.type === "done" && assistantContent) {
          saveMessage(db, { conversationId: convId, role: "assistant", content: assistantContent });
        }
      } catch {
        // DB error during streaming -- don't kill the stream
      }

      yield event;
    }
  }

  const stream = loopToSSEStream(tracked());
  return new Response(stream, { headers: SSE_HEADERS });
}
