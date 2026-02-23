import type { LLMResponse, Message, ToolCall, ToolDefinitionForLLM } from "@/lib/engine/types";
import type { Provider } from "./types";

interface OllamaConfig {
  model: string;
  baseUrl?: string;
}

// Ollama wire types
interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> | string };
}

interface OllamaMessage {
  role: string;
  content: string;
  tool_calls?: OllamaToolCall[] | null;
}

interface OllamaResponse {
  message: OllamaMessage;
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export class OllamaProvider implements Provider {
  private baseUrl: string;
  private defaultModel: string;

  constructor({ model, baseUrl = "http://localhost:11434" }: OllamaConfig) {
    this.defaultModel = model;
    this.baseUrl = baseUrl;
  }

  async chat(messages: Message[], tools: ToolDefinitionForLLM[], model: string): Promise<LLMResponse> {
    const body = {
      model: model ?? this.defaultModel,
      messages: this.serializeMessages(messages),
      tools: tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      stream: false,
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama request failed: ${res.status} - ${body}`);
    }

    let data: OllamaResponse;
    try {
      data = await res.json();
    } catch {
      throw new Error("Ollama returned invalid JSON");
    }
    return this.parseResponse(data);
  }

  private parseResponse(data: OllamaResponse): LLMResponse {
    const { tool_calls, content } = data.message;

    if (tool_calls && tool_calls.length > 0) {
      const calls: ToolCall[] = tool_calls.map((tc) => {
        const args = tc.function.arguments;
        return {
          id: crypto.randomUUID(),
          name: tc.function.name,
          // Ollama returns object; some models return JSON string -- normalise to string
          arguments: typeof args === "string" ? args : JSON.stringify(args),
        };
      });
      return { type: "tool_calls", calls };
    }

    return { type: "text", content: content ?? "" };
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
