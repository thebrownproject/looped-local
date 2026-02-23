/**
 * Provider interface for LLM backends.
 *
 * Imports only from engine/types (the dependency root).
 * Each concrete provider (Ollama, OpenAI, Anthropic) implements this interface.
 */

import type {
  LLMResponse,
  Message,
  ToolDefinitionForLLM,
} from "@/lib/engine/types";

export interface Provider {
  /**
   * Send a conversation and available tools to the LLM.
   * Returns a normalized response the engine can act on.
   */
  chat(
    messages: Message[],
    tools: ToolDefinitionForLLM[],
    model: string
  ): Promise<LLMResponse>;
}
