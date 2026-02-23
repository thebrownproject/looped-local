import type { ToolDefinition } from "@/lib/tools/types";
import type { ToolDefinitionForLLM } from "@/lib/engine/types";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.definition.name)) {
      console.warn(`ToolRegistry: overwriting existing tool "${tool.definition.name}"`);
    }
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  toToolDefinitions(): ToolDefinitionForLLM[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  async execute(name: string, args: string): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool "${name}" not found in registry`);
    return tool.execute(args);
  }
}
