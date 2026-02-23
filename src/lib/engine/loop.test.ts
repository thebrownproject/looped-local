import { describe, it, expect, vi, beforeEach } from "vitest";
import { runLoop } from "./loop";
import type { Provider } from "@/lib/providers/types";
import type { LLMResponse, LoopEvent, Message, ToolCall } from "@/lib/engine/types";
import { ToolRegistry } from "@/lib/tools/registry";

// Collect all events from the async generator into an array
async function collect(gen: AsyncGenerator<LoopEvent>): Promise<LoopEvent[]> {
  const events: LoopEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

function makeProvider(responses: LLMResponse[]): Provider {
  let i = 0;
  return { chat: vi.fn().mockImplementation(() => Promise.resolve(responses[i++])) };
}

function makeRegistry(results: Record<string, string> = {}): ToolRegistry {
  const registry = new ToolRegistry();
  for (const [name, result] of Object.entries(results)) {
    registry.register({
      definition: { name, description: "", parameters: {} },
      execute: vi.fn().mockResolvedValue(result),
    });
  }
  return registry;
}

const BASE_CONFIG = { maxIterations: 10, model: "test-model" };
const USER_MSG: Message = { role: "user", content: "Hello" };

describe("runLoop", () => {
  // -- Direct text response --

  it("yields [text, done] for a direct text response", async () => {
    const provider = makeProvider([{ type: "text", content: "Hello!" }]);
    const registry = makeRegistry();

    const events = await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));

    expect(events).toEqual([
      { type: "text", content: "Hello!" },
      { type: "done" },
    ]);
  });

  // -- Single tool call --

  it("yields [tool_call, tool_result, text, done] for a single tool call", async () => {
    const call: ToolCall = { id: "call_1", name: "bash", arguments: '{"cmd":"ls"}' };
    const provider = makeProvider([
      { type: "tool_calls", calls: [call] },
      { type: "text", content: "Done" },
    ]);
    const registry = makeRegistry({ bash: "file1.txt" });

    const events = await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));

    expect(events).toEqual([
      { type: "tool_call", call },
      { type: "tool_result", callId: "call_1", result: "file1.txt" },
      { type: "text", content: "Done" },
      { type: "done" },
    ]);
  });

  // -- Multi-turn tool calls --

  it("handles multi-turn tool calls across iterations", async () => {
    const call1: ToolCall = { id: "c1", name: "bash", arguments: '{"cmd":"pwd"}' };
    const call2: ToolCall = { id: "c2", name: "bash", arguments: '{"cmd":"ls"}' };
    const provider = makeProvider([
      { type: "tool_calls", calls: [call1] },
      { type: "tool_calls", calls: [call2] },
      { type: "text", content: "All done" },
    ]);
    const registry = makeRegistry({ bash: "result" });

    const events = await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));

    const types = events.map((e) => e.type);
    expect(types).toEqual(["tool_call", "tool_result", "tool_call", "tool_result", "text", "done"]);
  });

  // -- Max iterations --

  it("stops with error event when max iterations is reached", async () => {
    const call: ToolCall = { id: "c1", name: "bash", arguments: "{}" };
    // Always return a tool call so the loop never terminates naturally
    const provider = makeProvider(Array(5).fill({ type: "tool_calls", calls: [call] }));
    const registry = makeRegistry({ bash: "ok" });

    const events = await collect(
      runLoop({ provider, registry, config: { ...BASE_CONFIG, maxIterations: 2 }, messages: [USER_MSG] })
    );

    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === "error") {
      expect(errorEvent.message).toMatch(/max iterations/i);
    }
  });

  // -- Tool errors fed back as context --

  it("feeds tool errors back as context (not crashes)", async () => {
    const call: ToolCall = { id: "c1", name: "unknown_tool", arguments: "{}" };
    const provider = makeProvider([
      { type: "tool_calls", calls: [call] },
      { type: "text", content: "I got the error" },
    ]);
    const registry = makeRegistry(); // no tools registered - execute will throw

    const events = await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));

    const resultEvent = events.find((e) => e.type === "tool_result");
    expect(resultEvent).toBeDefined();
    if (resultEvent?.type === "tool_result") {
      expect(resultEvent.result).toMatch(/error/i);
    }
    // Loop should continue - final event is text then done
    const types = events.map((e) => e.type);
    expect(types).toContain("text");
    expect(types[types.length - 1]).toBe("done");
  });

  // -- Provider errors --

  it("yields error and done on provider error", async () => {
    const provider: Provider = {
      chat: vi.fn().mockRejectedValue(new Error("Network failure")),
    };
    const registry = makeRegistry();

    const events = await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));

    expect(events).toEqual([
      { type: "error", message: "Network failure" },
      { type: "done" },
    ]);
  });

  // -- Context accumulation --

  it("accumulates context correctly across iterations", async () => {
    const call: ToolCall = { id: "c1", name: "bash", arguments: '{"cmd":"echo hi"}' };
    const chatFn = vi.fn()
      .mockResolvedValueOnce({ type: "tool_calls", calls: [call] })
      .mockResolvedValueOnce({ type: "text", content: "Done" });
    const provider: Provider = { chat: chatFn };
    const registry = makeRegistry({ bash: "hi" });

    await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));

    // Second call should include the accumulated tool call and tool result messages
    const secondCallMessages: Message[] = chatFn.mock.calls[1][0];
    expect(secondCallMessages.some((m) => m.role === "assistant" && m.toolCalls)).toBe(true);
    expect(secondCallMessages.some((m) => m.role === "tool")).toBe(true);
  });

  // -- Messages array immutability --

  it("does not mutate the caller's messages array", async () => {
    const provider = makeProvider([
      { type: "tool_calls", calls: [{ id: "c1", name: "bash", arguments: "{}" }] },
      { type: "text", content: "Done" },
    ]);
    const registry = makeRegistry({ bash: "ok" });
    const originalMessages: Message[] = [USER_MSG];
    const originalLength = originalMessages.length;

    await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: originalMessages }));

    expect(originalMessages).toHaveLength(originalLength);
    expect(originalMessages[0]).toEqual(USER_MSG);
  });

  // -- Zero Next.js imports --

  it("has no Next.js or React imports in loop.ts", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "loop.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).not.toMatch(/from\s+["']next(?:\/[^"']*)?["']/);
    expect(content).not.toMatch(/from\s+["']react(?:\/[^"']*)?["']/);
  });

  // -- System prompt --

  it("prepends system prompt as first message when provided", async () => {
    const chatFn = vi.fn().mockResolvedValue({ type: "text", content: "Hi" });
    const provider: Provider = { chat: chatFn };
    const registry = makeRegistry();

    await collect(
      runLoop({
        provider,
        registry,
        config: { ...BASE_CONFIG, systemPrompt: "You are helpful." },
        messages: [USER_MSG],
      })
    );

    const calledMessages: Message[] = chatFn.mock.calls[0][0];
    expect(calledMessages[0]).toEqual({ role: "system", content: "You are helpful." });
  });
});

// -- Integration tests (require real Ollama) --

async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:11434/api/tags");
    return res.ok;
  } catch {
    return false;
  }
}

const ollamaAvailable = await isOllamaAvailable();

describe.skipIf(!ollamaAvailable)("runLoop integration (real Ollama)", () => {
  it("text response works against real Ollama", async () => {
    const { OllamaProvider } = await import("@/lib/providers/ollama");
    const provider = new OllamaProvider({ model: "qwen2.5-coder" });
    const registry = makeRegistry();

    const events = await collect(
      runLoop({
        provider,
        registry,
        config: { maxIterations: 5, model: "qwen2.5-coder" },
        messages: [{ role: "user", content: "Reply with only the word: pong" }],
      })
    );

    expect(events.some((e) => e.type === "text")).toBe(true);
    expect(events[events.length - 1].type).toBe("done");
  });

  it("tool calling works against real Ollama", async () => {
    const { OllamaProvider } = await import("@/lib/providers/ollama");
    const { createDefaultRegistry } = await import("@/lib/tools");
    const provider = new OllamaProvider({ model: "qwen2.5-coder" });
    const registry = createDefaultRegistry();

    const events = await collect(
      runLoop({
        provider,
        registry,
        config: { maxIterations: 5, model: "qwen2.5-coder", systemPrompt: "Use the bash tool to answer." },
        messages: [{ role: "user", content: "Run: echo hello" }],
      })
    );

    expect(events[events.length - 1].type).toBe("done");
    // Should have at least a text event
    expect(events.some((e) => e.type === "text")).toBe(true);
  }, 30000);
});
