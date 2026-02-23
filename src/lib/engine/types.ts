/**
 * Core engine types for the Looped inference loop.
 *
 * This file is the dependency root of the type system.
 * Provider and tool types import from here, not the other way around.
 * No Next.js imports allowed in this file.
 */

// -- Message types --

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Message {
  role: MessageRole;
  content: string | null;
  toolCalls?: ToolCall[];
  /** Present on tool-result messages to link back to the originating call */
  toolCallId?: string;
}

// -- LLM response types --

/**
 * Normalized response from any LLM provider.
 * The engine uses this to decide whether to loop (tool calls) or stop (text).
 */
export type LLMResponse =
  | { type: "text"; content: string }
  | { type: "tool_calls"; calls: ToolCall[] };

// -- Tool definition for the LLM --

/**
 * JSON Schema-style description of a tool parameter.
 * Passed to the LLM so it knows what tools are available.
 */
export interface ToolDefinitionForLLM {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// -- Loop configuration --

export interface LoopConfig {
  /** Maximum iterations before the loop is forcefully stopped */
  maxIterations: number;
  /** Model identifier to pass to the provider */
  model: string;
  /** Optional system prompt prepended to the conversation */
  systemPrompt?: string;
}

// -- Loop events (streamed back to the caller) --

/**
 * Discriminated union of events emitted by the inference loop.
 * The API route converts these into SSE frames for the frontend.
 */
export type LoopEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; callId: string; result: string }
  | { type: "conversation"; conversationId: string }
  | { type: "error"; message: string }
  | { type: "done" };
