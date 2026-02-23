import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// -- Test: All type files are importable --

describe("type imports", () => {
  it("imports engine types without errors", async () => {
    const engineTypes = await import("@/lib/engine/types");

    // Verify key exports exist as types (they compile, so they exist)
    expect(engineTypes).toBeDefined();
  });

  it("imports provider types without errors", async () => {
    const providerTypes = await import("@/lib/providers/types");

    expect(providerTypes).toBeDefined();
  });

  it("imports tool types without errors", async () => {
    const toolTypes = await import("@/lib/tools/types");

    expect(toolTypes).toBeDefined();
  });
});

// -- Test: Engine types have zero Next.js imports --

describe("engine types isolation", () => {
  it("has no Next.js imports in engine/types.ts", () => {
    const filePath = path.resolve(__dirname, "../src/lib/engine/types.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Should not import from "next" or "next/*"
    const nextImportPattern = /from\s+["']next(?:\/[^"']*)?["']/;
    expect(content).not.toMatch(nextImportPattern);

    // Should not import from "react" either (engine is framework-agnostic)
    const reactImportPattern = /from\s+["']react(?:\/[^"']*)?["']/;
    expect(content).not.toMatch(reactImportPattern);
  });
});

// -- Test: No circular imports --

describe("no circular imports", () => {
  it("engine/types.ts does not import from providers or tools", () => {
    const filePath = path.resolve(__dirname, "../src/lib/engine/types.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Engine types should not import from providers or tools
    const providerImport = /from\s+["']@\/lib\/providers/;
    const toolImport = /from\s+["']@\/lib\/tools/;

    expect(content).not.toMatch(providerImport);
    expect(content).not.toMatch(toolImport);
  });

  it("providers/types.ts only imports from engine/types", () => {
    const filePath = path.resolve(__dirname, "../src/lib/providers/types.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Should import from engine types
    const engineImport = /from\s+["']@\/lib\/engine\/types["']/;
    expect(content).toMatch(engineImport);

    // Should not import from tools
    const toolImport = /from\s+["']@\/lib\/tools/;
    expect(content).not.toMatch(toolImport);
  });

  it("tools/types.ts only imports from engine/types", () => {
    const filePath = path.resolve(__dirname, "../src/lib/tools/types.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Should import from engine types
    const engineImport = /from\s+["']@\/lib\/engine\/types["']/;
    expect(content).toMatch(engineImport);

    // Should not import from providers
    const providerImport = /from\s+["']@\/lib\/providers/;
    expect(content).not.toMatch(providerImport);
  });
});

// -- Test: Type correctness at compile time (runtime shape checks) --

describe("engine type shapes", () => {
  it("MessageRole includes expected roles", () => {
    // We verify the type by creating valid values
    // If these fail to compile, the test runner will catch it
    const roles: Array<import("@/lib/engine/types").MessageRole> = [
      "system",
      "user",
      "assistant",
      "tool",
    ];
    expect(roles).toHaveLength(4);
  });

  it("Message can hold tool calls", () => {
    const msg: import("@/lib/engine/types").Message = {
      role: "assistant",
      content: null,
      toolCalls: [{ id: "call_1", name: "bash", arguments: '{"cmd":"ls"}' }],
    };
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls![0].name).toBe("bash");
  });

  it("LLMResponse discriminates on type field", () => {
    const textResponse: import("@/lib/engine/types").LLMResponse = {
      type: "text",
      content: "Hello",
    };
    const toolResponse: import("@/lib/engine/types").LLMResponse = {
      type: "tool_calls",
      calls: [{ id: "call_1", name: "bash", arguments: "{}" }],
    };

    expect(textResponse.type).toBe("text");
    expect(toolResponse.type).toBe("tool_calls");
  });

  it("LoopEvent covers all event types", () => {
    const events: Array<import("@/lib/engine/types").LoopEvent> = [
      { type: "text", content: "Hello" },
      {
        type: "tool_call",
        call: { id: "1", name: "bash", arguments: "{}" },
      },
      { type: "tool_result", callId: "1", result: "output" },
      { type: "error", message: "something went wrong" },
      { type: "done" },
    ];
    expect(events).toHaveLength(5);
  });

  it("LoopConfig has required fields", () => {
    const config: import("@/lib/engine/types").LoopConfig = {
      maxIterations: 10,
      model: "qwen2.5-coder",
    };
    expect(config.maxIterations).toBe(10);
    expect(config.model).toBe("qwen2.5-coder");
    expect(config.systemPrompt).toBeUndefined();
  });
});
