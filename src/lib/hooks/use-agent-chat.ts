"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LoopEvent, ToolCall } from "@/lib/engine/types";

export type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error";

export interface ToolPart {
  type: "dynamic-tool";
  toolName: string;
  toolCallId: string;
  state: ToolState;
  input: unknown;
  output?: unknown;
  errorText?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolParts?: ToolPart[];
  reasoning?: string;
  thinkingDuration?: number;
}

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

// Map stored DB messages to ChatMessage[]. Tool result rows are merged into their
// parent assistant message's toolParts, so we skip role=tool rows in the main output.
interface StoredMessage {
  id: string;
  role: string;
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

function mapStoredMessages(rows: StoredMessage[]): ChatMessage[] {
  // Build a lookup of toolCallId -> result content from tool-role rows (Bug 4)
  const toolResults = new Map<string, string>();
  for (const row of rows) {
    if (row.role === "tool" && row.toolCallId && row.content != null) {
      toolResults.set(row.toolCallId, row.content);
    }
  }

  const out: ChatMessage[] = [];
  for (const row of rows) {
    if (row.role === "tool") continue;
    if (row.role === "user") {
      out.push({ id: row.id, role: "user", content: row.content ?? "" });
    } else if (row.role === "assistant") {
      const toolParts: ToolPart[] = (row.toolCalls ?? []).map((tc) => ({
        type: "dynamic-tool",
        toolName: tc.name,
        toolCallId: tc.id,
        state: "output-available" as const,
        input: (() => { try { return JSON.parse(tc.arguments); } catch { return tc.arguments; } })(),
        output: toolResults.get(tc.id),
      }));
      out.push({ id: row.id, role: "assistant", content: row.content ?? "", toolParts });
    }
  }
  return out;
}

const VALID_EVENT_TYPES = new Set([
  "thinking", "text_delta", "text", "tool_call", "tool_result", "conversation", "error", "done",
]);

function isLoopEvent(data: unknown): data is LoopEvent {
  return typeof data === "object" && data !== null && "type" in data
    && VALID_EVENT_TYPES.has((data as { type: string }).type);
}

// Split SSE body into LoopEvents
async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<LoopEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        const parsed: unknown = JSON.parse(json);
        if (isLoopEvent(parsed)) yield parsed;
      } catch {
        // malformed frame
      }
    }
  }

  // Bug 3: Flush decoder and process any remaining buffer content
  buffer += decoder.decode();
  if (buffer.trim()) {
    const line = buffer.trim();
    if (line.startsWith("data:")) {
      const json = line.slice(5).trim();
      if (json) {
        try {
          const parsed: unknown = JSON.parse(json);
          if (isLoopEvent(parsed)) yield parsed;
        } catch {
          // malformed trailing frame
        }
      }
    }
  }
}

// initialConversationId is read once on mount. The parent component uses key={id}
// to force a full remount when the conversation changes, so changes to this prop
// after mount are intentionally ignored. (Bug 7)
export function useAgentChat(initialConversationId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [conversationId, setConversationIdState] = useState<string | undefined>(initialConversationId);
  const conversationIdRef = useRef<string | undefined>(initialConversationId);
  const messagesRef = useRef<ChatMessage[]>([]);
  const statusRef = useRef<ChatStatus>("ready");
  const abortRef = useRef<AbortController | null>(null);
  const thinkingStartRef = useRef<number | null>(null);

  // Bug 8: Sync messagesRef via useEffect instead of inside setState updater
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Bug 1: Abort in-flight fetch on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Load history when a conversationId is provided on mount
  useEffect(() => {
    if (!initialConversationId) return;
    fetch(`/api/conversations/${initialConversationId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.messages) return;
        const loaded = mapStoredMessages(data.messages as StoredMessage[]);
        setMessages(loaded);
      })
      .catch(() => {/* leave messages empty on error */});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const setConversationId = useCallback((id: string) => {
    conversationIdRef.current = id;
    setConversationIdState(id);
  }, []);

  const sendMessage = useCallback(async (text: string, model = "qwen2.5-coder") => {
    // Bug 2: Guard against concurrent sends
    if (statusRef.current !== "ready") return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };

    const history = [...messagesRef.current, userMsg];
    setMessages(history);
    setStatus("submitted");
    statusRef.current = "submitted";

    const engineMessages = history.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.toolParts?.length && {
        toolCalls: m.toolParts.map((tp) => ({
          id: tp.toolCallId,
          name: tp.toolName,
          arguments: typeof tp.input === "string" ? tp.input : JSON.stringify(tp.input),
        })),
      }),
    }));

    // Bug 1: Create AbortController for this request
    const controller = new AbortController();
    abortRef.current = controller;

    let response: Response;
    try {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: engineMessages,
          conversationId: conversationIdRef.current,
          model,
        }),
      });
    } catch {
      setStatus("error");
      statusRef.current = "error";
      return;
    }

    if (!response.ok || !response.body) {
      setStatus("error");
      statusRef.current = "error";
      return;
    }

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", toolParts: [] },
    ]);
    setStatus("streaming");
    statusRef.current = "streaming";

    thinkingStartRef.current = null;

    const toolMap = new Map<string, ToolPart>();
    let receivedTextDelta = false;

    const updateAssistant = (updater: (m: ChatMessage) => ChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? updater(m) : m)));
    };

    for await (const event of parseSSE(response.body)) {
      if (event.type === "thinking") {
        if (thinkingStartRef.current === null) thinkingStartRef.current = Date.now();
        updateAssistant((m) => ({ ...m, reasoning: (m.reasoning ?? "") + event.content }));
      } else if (event.type === "text_delta") {
        if (!receivedTextDelta) {
          receivedTextDelta = true;
          if (thinkingStartRef.current !== null) {
            const duration = Date.now() - thinkingStartRef.current;
            thinkingStartRef.current = null;
            updateAssistant((m) => ({ ...m, thinkingDuration: duration }));
          }
        }
        updateAssistant((m) => ({ ...m, content: m.content + event.content }));
      } else if (event.type === "text") {
        // backward compat: only use if no text_delta received (streaming models use text_delta)
        if (!receivedTextDelta) {
          updateAssistant((m) => ({ ...m, content: m.content + event.content }));
        }
      } else if (event.type === "tool_call") {
        const part: ToolPart = {
          type: "dynamic-tool",
          toolName: event.call.name,
          toolCallId: event.call.id,
          state: "input-available",
          input: (() => {
            try { return JSON.parse(event.call.arguments); } catch { return event.call.arguments; }
          })(),
        };
        toolMap.set(event.call.id, part);
        updateAssistant((m) => ({ ...m, toolParts: [...toolMap.values()] }));
      } else if (event.type === "tool_result") {
        const existing = toolMap.get(event.callId);
        if (existing) {
          toolMap.set(event.callId, { ...existing, state: "output-available", output: event.result });
          updateAssistant((m) => ({ ...m, toolParts: [...toolMap.values()] }));
        }
      } else if (event.type === "conversation") {
        // Bug 6: Capture conversationId from server
        setConversationId(event.conversationId);
      } else if (event.type === "error") {
        setStatus("error");
        statusRef.current = "error";
        return;
      } else if (event.type === "done") {
        setStatus("ready");
        statusRef.current = "ready";
        return;
      }
    }

    setStatus("ready");
    statusRef.current = "ready";
  }, [setConversationId]);

  return { messages, status, sendMessage, setConversationId, conversationId };
}
