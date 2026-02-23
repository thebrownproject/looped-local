export { ToolRegistry } from "./registry";
export type { ToolDefinition } from "./types";
export { bashTool, createBashTool } from "./bash";
export { readFileTool, createReadFileTool } from "./read-file";
export { writeFileTool, createWriteFileTool } from "./write-file";

import { ToolRegistry } from "./registry";
import { bashTool } from "./bash";
import { readFileTool } from "./read-file";
import { writeFileTool } from "./write-file";

/** Create a ToolRegistry pre-loaded with all built-in tools. */
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(bashTool);
  registry.register(readFileTool);
  registry.register(writeFileTool);
  return registry;
}
