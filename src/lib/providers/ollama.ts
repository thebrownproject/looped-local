import type { Message, ToolCall, ToolDefinitionForLLM } from "@/lib/engine/types";
import type { Provider, ProviderEvent } from "./types";

interface OllamaConfig {
  model: string;
  baseUrl?: string;
}

// Ollama wire types
interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> | string };
}

interface OllamaFrame {
  message: { role: string; content: string; tool_calls?: OllamaToolCall[] | null };
  done: boolean;
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Yields NDJSON frames from a ReadableStream body.
async function* parseNDJSON(body: ReadableStream<Uint8Array>): AsyncGenerator<OllamaFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as OllamaFrame;
    }
  }

  if (buffer.trim()) yield JSON.parse(buffer) as OllamaFrame;
}

// Think-tag state machine. Processes text char-by-char, yielding ProviderEvents.
// Batches consecutive same-type chars into single events per invocation.
// State persists across chunks via the returned state value.
type ThinkState = "outside" | "maybe_open" | "inside" | "maybe_close";

interface ThinkMachineState {
  state: ThinkState;
  buf: string; // partial tag buffer for maybe_open / maybe_close
}

function* processThinkChunk(
  text: string,
  machine: ThinkMachineState
): Generator<ProviderEvent> {
  const OPEN = "<think>";
  const CLOSE = "</think>";

  let outside = "";
  let thinking = "";

  const flush = (): ProviderEvent | null => {
    if (outside) {
      const ev: ProviderEvent = { type: "text_delta", content: outside };
      outside = "";
      return ev;
    }
    if (thinking) {
      const ev: ProviderEvent = { type: "thinking", content: thinking };
      thinking = "";
      return ev;
    }
    return null;
  };

  for (const ch of text) {
    switch (machine.state) {
      case "outside":
        if (ch === "<") {
          const ev = flush();
          if (ev) yield ev;
          machine.state = "maybe_open";
          machine.buf = "<";
        } else {
          outside += ch;
        }
        break;

      case "maybe_open":
        machine.buf += ch;
        if (OPEN.startsWith(machine.buf)) {
          if (machine.buf === OPEN) {
            machine.state = "inside";
            machine.buf = "";
          }
          // else keep accumulating
        } else {
          // Not a think tag -- emit buffered chars as outside text
          outside += machine.buf;
          machine.state = "outside";
          machine.buf = "";
        }
        break;

      case "inside":
        if (ch === "<") {
          const ev = flush();
          if (ev) yield ev;
          machine.state = "maybe_close";
          machine.buf = "<";
        } else {
          thinking += ch;
        }
        break;

      case "maybe_close":
        machine.buf += ch;
        if (CLOSE.startsWith(machine.buf)) {
          if (machine.buf === CLOSE) {
            const ev = flush();
            if (ev) yield ev;
            machine.state = "outside";
            machine.buf = "";
          }
          // else keep accumulating
        } else {
          // Not a close tag -- emit as thinking content
          thinking += machine.buf;
          machine.state = "inside";
          machine.buf = "";
        }
        break;
    }
  }

  const ev = flush();
  if (ev) yield ev;
}

export class OllamaProvider implements Provider {
  private baseUrl: string;
  private defaultModel: string;

  constructor({ model, baseUrl = "http://localhost:11434" }: OllamaConfig) {
    this.defaultModel = model;
    this.baseUrl = baseUrl;
  }

  async *chat(
    messages: Message[],
    tools: ToolDefinitionForLLM[],
    model: string
  ): AsyncGenerator<ProviderEvent> {
    const requestBody = {
      model: model ?? this.defaultModel,
      messages: this.serializeMessages(messages),
      tools: tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      stream: true,
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama request failed: ${res.status} - ${text}`);
    }

    const machine: ThinkMachineState = { state: "outside", buf: "" };

    for await (const frame of parseNDJSON(res.body!)) {
      if (frame.done && frame.message.tool_calls?.length) {
        const calls: ToolCall[] = frame.message.tool_calls.map((tc) => {
          const args = tc.function.arguments;
          return {
            id: crypto.randomUUID(),
            name: tc.function.name,
            arguments: typeof args === "string" ? args : JSON.stringify(args),
          };
        });
        yield { type: "tool_calls", calls };
        return;
      }

      if (!frame.done && frame.message.content) {
        yield* processThinkChunk(frame.message.content, machine);
      }
    }
  }

  // Serialize engine Message[] to Ollama wire format.
  // Tool-result messages need tool_name (Ollama) not toolCallId (engine).
  // We scan back through the array to resolve the name from the originating assistant message.
  private serializeMessages(messages: Message[]): Record<string, unknown>[] {
    return messages.map((msg, i) => {
      if (msg.role === "tool") {
        const toolName = this.resolveToolName(messages, i, msg.toolCallId);
        return { role: "tool", tool_name: toolName, content: msg.content ?? "" };
      }

      if (msg.role === "assistant" && msg.toolCalls) {
        return {
          role: "assistant",
          content: msg.content ?? "",
          tool_calls: msg.toolCalls.map((tc) => ({
            function: { name: tc.name, arguments: safeParseJson(tc.arguments) },
          })),
        };
      }

      return { role: msg.role, content: msg.content ?? "" };
    });
  }

  // Walk backwards from the tool-result to the assistant message that contains
  // the matching tool call, returning its name. Falls back to toolCallId if not found.
  private resolveToolName(messages: Message[], resultIndex: number, callId?: string): string {
    if (!callId) return "unknown";
    for (let i = resultIndex - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.toolCalls) {
        const match = msg.toolCalls.find((tc) => tc.id === callId);
        if (match) return match.name;
      }
    }
    return callId;
  }
}
