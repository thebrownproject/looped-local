import { NextRequest } from "next/server";
import { OllamaProvider } from "@/lib/providers";
import { createDefaultRegistry } from "@/lib/tools";
import { runLoop } from "@/lib/engine";
import type { Message } from "@/lib/engine";
import { loopToSSEStream } from "@/lib/engine/adapters";
import { getDb, createConversation, saveMessage } from "@/lib/db";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

export async function POST(req: NextRequest) {
  let body: { messages?: Message[]; conversationId?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages, conversationId, model = "qwen2.5-coder" } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages is required" }, { status: 400 });
  }

  const db = getDb();

  // Resolve or create conversation
  const convId =
    conversationId ??
    createConversation(db, messages[0].content?.slice(0, 60) ?? "New chat").id;

  // Persist user message (last message in array)
  const userMessage = messages[messages.length - 1];
  saveMessage(db, {
    conversationId: convId,
    role: userMessage.role,
    content: userMessage.content,
    toolCalls: userMessage.toolCalls,
    toolCallId: userMessage.toolCallId,
  });

  const provider = new OllamaProvider({ model });
  const registry = createDefaultRegistry();

  // Buffer text events to build the full assistant message after loop
  let assistantContent = "";
  const validatedMessages: Message[] = messages;

  async function* tracked(): AsyncGenerator<import("@/lib/engine").LoopEvent> {
    const gen = runLoop({ provider, registry, config: { model, maxIterations: 20 }, messages: validatedMessages });
    for await (const event of gen) {
      if (event.type === "text") assistantContent += event.content;
      yield event;
      if (event.type === "done") {
        saveMessage(db, { conversationId: convId, role: "assistant", content: assistantContent });
      }
    }
  }

  const stream = loopToSSEStream(tracked(), undefined);
  return new Response(stream, { headers: SSE_HEADERS });
}
