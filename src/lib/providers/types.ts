/**
 * Provider interface for LLM backends.
 *
 * Imports only from engine/types (the dependency root).
 * Each concrete provider (Ollama, OpenAI, Anthropic) implements this interface.
 */

import type {
  LLMResponse,
  Message,
  ToolCall,
  ToolDefinitionForLLM,
} from "@/lib/engine/types";

export type ProviderEvent =
  | { type: "thinking"; content: string }
  | { type: "text_delta"; content: string }
  | { type: "tool_calls"; calls: ToolCall[] };

export interface Provider {
  /** Stream provider events for a conversation. */
  chat(
    messages: Message[],
    tools: ToolDefinitionForLLM[],
    model: string
  ): AsyncGenerator<ProviderEvent>;
}
