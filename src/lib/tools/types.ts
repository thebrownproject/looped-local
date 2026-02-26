/**
 * Tool definition interface for the Bashling tool system.
 *
 * Imports only from engine/types (the dependency root).
 * Each tool (bash, file read/write, etc.) implements this interface.
 */

import type { ToolDefinitionForLLM } from "@/lib/engine/types";

export interface ToolDefinition {
  /** Metadata passed to the LLM so it knows what this tool does */
  definition: ToolDefinitionForLLM;

  /**
   * Execute the tool with the given arguments (JSON string from the LLM).
   * Returns a string result that gets fed back into the conversation.
   */
  execute(args: string): Promise<string>;
}
