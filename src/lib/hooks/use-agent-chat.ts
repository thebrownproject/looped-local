"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LoopEvent } from "@/lib/engine/types";

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
}

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

// Map stored DB messages to ChatMessage[]. Tool result rows are merged into their
// parent assistant message's toolParts, so we skip role=tool rows here.
interface StoredMessage {
  id: string;
  role: string;
  content: string | null;
  toolCalls?: { id: string; name: string; arguments: string }[] | undefined;
}

function mapStoredMessages(rows: StoredMessage[]): ChatMessage[] {
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
        state: "output-available",
        input: (() => { try { return JSON.parse(tc.arguments); } catch { return tc.arguments; } })(),
      }));
      out.push({ id: row.id, role: "assistant", content: row.content ?? "", toolParts });
    }
  }
  return out;
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
        yield JSON.parse(json) as LoopEvent;
      } catch {
        // malformed frame
      }
    }
  }
}

export function useAgentChat(initialConversationId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [conversationId, setConversationIdState] = useState<string | undefined>(initialConversationId);
  const conversationIdRef = useRef<string | undefined>(initialConversationId);
  // Ref mirrors messages state so async callbacks read the latest value
  const messagesRef = useRef<ChatMessage[]>([]);

  // Load history when a conversationId is provided on mount
  useEffect(() => {
    if (!initialConversationId) return;
    fetch(`/api/conversations/${initialConversationId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.messages) return;
        const loaded = mapStoredMessages(data.messages as StoredMessage[]);
        messagesRef.current = loaded;
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
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };

    const history = [...messagesRef.current, userMsg];
    messagesRef.current = history;
    setMessages(history);
    setStatus("submitted");

    const engineMessages = history.map((m) => ({ role: m.role, content: m.content }));

    let response: Response;
    try {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: engineMessages,
          conversationId: conversationIdRef.current,
          model,
        }),
      });
    } catch {
      setStatus("error");
      return;
    }

    if (!response.ok || !response.body) {
      setStatus("error");
      return;
    }

    const assistantId = crypto.randomUUID();
    const withAssistant: ChatMessage[] = [
      ...messagesRef.current,
      { id: assistantId, role: "assistant", content: "", toolParts: [] },
    ];
    messagesRef.current = withAssistant;
    setMessages(withAssistant);
    setStatus("streaming");

    const toolMap = new Map<string, ToolPart>();

    const updateAssistant = (updater: (m: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === assistantId ? updater(m) : m));
        messagesRef.current = next;
        return next;
      });
    };

    for await (const event of parseSSE(response.body)) {
      if (event.type === "text") {
        updateAssistant((m) => ({ ...m, content: m.content + event.content }));
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
      } else if (event.type === "error") {
        setStatus("error");
        return;
      } else if (event.type === "done") {
        setStatus("ready");
        return;
      }
    }

    setStatus("ready");
  }, []);

  return { messages, status, sendMessage, setConversationId, conversationId };
}
