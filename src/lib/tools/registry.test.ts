import { describe, it, expect, beforeEach, vi } from "vitest";
import { ToolRegistry } from "./registry";
import type { ToolDefinition } from "@/lib/tools/types";

function makeTool(name: string): ToolDefinition {
  return {
    definition: {
      name,
      description: `${name} tool`,
      parameters: { type: "object", properties: { input: { type: "string" } }, required: ["input"] },
    },
    execute: async (args: string) => `executed ${name} with ${args}`,
  };
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  // -- Registration and retrieval --

  it("registers and retrieves a tool by name", () => {
    const tool = makeTool("bash");
    registry.register(tool);
    expect(registry.get("bash")).toBe(tool);
  });

  it("lists all registered tool names", () => {
    registry.register(makeTool("bash"));
    registry.register(makeTool("read_file"));
    expect(registry.list()).toEqual(["bash", "read_file"]);
  });

  it("returns undefined for unregistered tool", () => {
    expect(registry.get("unknown")).toBeUndefined();
  });

  // -- Serialization --

  it("toToolDefinitions returns ToolDefinitionForLLM array", () => {
    registry.register(makeTool("bash"));
    const defs = registry.toToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe("bash");
    expect(defs[0].description).toBe("bash tool");
    expect(defs[0].parameters).toBeDefined();
  });

  it("toToolDefinitions returns empty array when no tools registered", () => {
    expect(registry.toToolDefinitions()).toEqual([]);
  });

  // -- Execute --

  it("executes a registered tool by name", async () => {
    registry.register(makeTool("bash"));
    const result = await registry.execute("bash", '{"input":"hello"}');
    expect(result).toBe('executed bash with {"input":"hello"}');
  });

  it("throws on execute of unknown tool", async () => {
    await expect(registry.execute("unknown", "{}")).rejects.toThrow(
      'Tool "unknown" not found in registry'
    );
  });

  // -- Duplicate registration --

  it("warns on duplicate tool registration", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registry.register(makeTool("bash"));
    registry.register(makeTool("bash"));
    expect(warnSpy).toHaveBeenCalledWith(
      'ToolRegistry: overwriting existing tool "bash"'
    );
    warnSpy.mockRestore();
  });

  it("overwrites tool on duplicate registration", () => {
    const tool1 = makeTool("bash");
    const tool2 = makeTool("bash");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    registry.register(tool1);
    registry.register(tool2);
    expect(registry.get("bash")).toBe(tool2);
    vi.restoreAllMocks();
  });
});
