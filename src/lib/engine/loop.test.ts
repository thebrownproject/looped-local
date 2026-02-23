import { describe, it, expect, vi } from "vitest";
import { runLoop } from "./loop";
import type { Provider } from "@/lib/providers/types";
import type { LLMResponse, LoopEvent, Message, ToolCall } from "@/lib/engine/types";
import { ToolRegistry } from "@/lib/tools/registry";

async function collect(gen: AsyncGenerator<LoopEvent>): Promise<LoopEvent[]> {
  const events: LoopEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

function makeProvider(responses: LLMResponse[]): Provider {
  let i = 0;
  return {
    chat: vi.fn().mockImplementation(() => {
      if (i >= responses.length) throw new Error("mock exhausted");
      return Promise.resolve(responses[i++]);
    }),
  };
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

  // -- Multiple tool calls in a single response --

  it("processes multiple tool calls in a single response", async () => {
    const call1: ToolCall = { id: "c1", name: "bash", arguments: '{"cmd":"pwd"}' };
    const call2: ToolCall = { id: "c2", name: "read", arguments: '{"path":"/tmp/x"}' };
    const provider = makeProvider([
      { type: "tool_calls", calls: [call1, call2] },
      { type: "text", content: "Got both results" },
    ]);
    const registry = makeRegistry({ bash: "/home", read: "file content" });

    const events = await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));

    expect(events).toEqual([
      { type: "tool_call", call: call1 },
      { type: "tool_result", callId: "c1", result: "/home" },
      { type: "tool_call", call: call2 },
      { type: "tool_result", callId: "c2", result: "file content" },
      { type: "text", content: "Got both results" },
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

  // -- Empty tool_calls array --

  it("yields error for empty tool_calls array instead of corrupting context", async () => {
    const provider = makeProvider([{ type: "tool_calls", calls: [] }]);
    const registry = makeRegistry();

    const events = await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));

    expect(events).toEqual([
      { type: "error", message: "Provider returned empty tool_calls" },
      { type: "done" },
    ]);
  });

  // -- Max iterations --

  it("stops with error event when max iterations is reached", async () => {
    const call: ToolCall = { id: "c1", name: "bash", arguments: "{}" };
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

  // -- maxIterations: 0 --

  it("yields error for maxIterations: 0", async () => {
    const provider = makeProvider([{ type: "text", content: "Never reached" }]);
    const registry = makeRegistry();

    const events = await collect(
      runLoop({ provider, registry, config: { ...BASE_CONFIG, maxIterations: 0 }, messages: [USER_MSG] })
    );

    expect(events).toEqual([
      { type: "error", message: "Invalid maxIterations" },
      { type: "done" },
    ]);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  // -- maxIterations: negative --

  it("yields error for negative maxIterations", async () => {
    const provider = makeProvider([{ type: "text", content: "Never reached" }]);
    const registry = makeRegistry();

    const events = await collect(
      runLoop({ provider, registry, config: { ...BASE_CONFIG, maxIterations: -1 }, messages: [USER_MSG] })
    );

    expect(events).toEqual([
      { type: "error", message: "Invalid maxIterations" },
      { type: "done" },
    ]);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  // -- maxIterations: 1 with text response --

  it("completes successfully with maxIterations: 1 when provider returns text", async () => {
    const provider = makeProvider([{ type: "text", content: "Quick reply" }]);
    const registry = makeRegistry();

    const events = await collect(
      runLoop({ provider, registry, config: { ...BASE_CONFIG, maxIterations: 1 }, messages: [USER_MSG] })
    );

    expect(events).toEqual([
      { type: "text", content: "Quick reply" },
      { type: "done" },
    ]);
  });

  // -- maxIterations: 1 with tool call --

  it("hits max iterations with maxIterations: 1 when provider returns tool call", async () => {
    const call: ToolCall = { id: "c1", name: "bash", arguments: "{}" };
    const provider = makeProvider([
      { type: "tool_calls", calls: [call] },
      { type: "text", content: "Never reached" },
    ]);
    const registry = makeRegistry({ bash: "ok" });

    const events = await collect(
      runLoop({ provider, registry, config: { ...BASE_CONFIG, maxIterations: 1 }, messages: [USER_MSG] })
    );

    const types = events.map((e) => e.type);
    expect(types).toEqual(["tool_call", "tool_result", "error", "done"]);
    const errorEvent = events.find((e) => e.type === "error");
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
    const registry = makeRegistry();

    const events = await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));

    const resultEvent = events.find((e) => e.type === "tool_result");
    expect(resultEvent).toBeDefined();
    if (resultEvent?.type === "tool_result") {
      expect(resultEvent.result).toMatch(/error/i);
    }
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

  // -- Provider error on second iteration (mid-loop) --

  it("yields tool events then error when provider fails on second iteration", async () => {
    const call: ToolCall = { id: "c1", name: "bash", arguments: '{"cmd":"ls"}' };
    const chatFn = vi.fn()
      .mockResolvedValueOnce({ type: "tool_calls", calls: [call] })
      .mockRejectedValueOnce(new Error("Connection reset"));
    const provider: Provider = { chat: chatFn };
    const registry = makeRegistry({ bash: "file.txt" });

    const events = await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));

    expect(events).toEqual([
      { type: "tool_call", call },
      { type: "tool_result", callId: "c1", result: "file.txt" },
      { type: "error", message: "Connection reset" },
      { type: "done" },
    ]);
  });

  // -- Context accumulation (strengthened) --

  it("accumulates context correctly across iterations", async () => {
    const call: ToolCall = { id: "c1", name: "bash", arguments: '{"cmd":"echo hi"}' };
    // Capture snapshots of ctx at each call since the array is mutated in place
    const snapshots: Message[][] = [];
    const chatFn = vi.fn().mockImplementation((messages: Message[]) => {
      snapshots.push([...messages]);
      if (snapshots.length === 1) return Promise.resolve({ type: "tool_calls", calls: [call] });
      return Promise.resolve({ type: "text", content: "Done" });
    });
    const provider: Provider = { chat: chatFn };
    const registry = makeRegistry({ bash: "hi" });

    await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));

    // First call: just the user message
    expect(snapshots[0]).toHaveLength(1);
    expect(snapshots[0][0]).toEqual(USER_MSG);

    // Second call: user + assistant (with toolCalls) + tool result
    expect(snapshots[1]).toHaveLength(3);
    expect(snapshots[1][0]).toEqual(USER_MSG);
    expect(snapshots[1][1]).toEqual({
      role: "assistant",
      content: null,
      toolCalls: [call],
    });
    expect(snapshots[1][2]).toEqual({
      role: "tool",
      content: "hi",
      toolCallId: "c1",
    });
  });

  // -- Context accumulation with multiple tool calls in one response --

  it("accumulates context correctly with multiple tool calls in one response", async () => {
    const call1: ToolCall = { id: "c1", name: "bash", arguments: '{"cmd":"pwd"}' };
    const call2: ToolCall = { id: "c2", name: "read", arguments: '{"path":"/tmp"}' };
    const snapshots: Message[][] = [];
    const chatFn = vi.fn().mockImplementation((messages: Message[]) => {
      snapshots.push([...messages]);
      if (snapshots.length === 1) return Promise.resolve({ type: "tool_calls", calls: [call1, call2] });
      return Promise.resolve({ type: "text", content: "Done" });
    });
    const provider: Provider = { chat: chatFn };
    const registry = makeRegistry({ bash: "/home", read: "data" });

    await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));

    // Second call: user + assistant + tool1 result + tool2 result
    expect(snapshots[1]).toHaveLength(4);
    expect(snapshots[1][0]).toEqual(USER_MSG);
    expect(snapshots[1][1]).toEqual({
      role: "assistant",
      content: null,
      toolCalls: [call1, call2],
    });
    expect(snapshots[1][2]).toEqual({ role: "tool", content: "/home", toolCallId: "c1" });
    expect(snapshots[1][3]).toEqual({ role: "tool", content: "data", toolCallId: "c2" });
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

  // -- System prompt with tool calls --

  it("preserves system prompt in context across tool call iterations", async () => {
    const call: ToolCall = { id: "c1", name: "bash", arguments: '{"cmd":"ls"}' };
    const chatFn = vi.fn()
      .mockResolvedValueOnce({ type: "tool_calls", calls: [call] })
      .mockResolvedValueOnce({ type: "text", content: "Done" });
    const provider: Provider = { chat: chatFn };
    const registry = makeRegistry({ bash: "result" });

    await collect(
      runLoop({
        provider,
        registry,
        config: { ...BASE_CONFIG, systemPrompt: "You are a shell assistant." },
        messages: [USER_MSG],
      })
    );

    // First call: system + user
    const firstCallMessages: Message[] = chatFn.mock.calls[0][0];
    expect(firstCallMessages[0]).toEqual({ role: "system", content: "You are a shell assistant." });
    expect(firstCallMessages[1]).toEqual(USER_MSG);

    // Second call: system + user + assistant + tool
    const secondCallMessages: Message[] = chatFn.mock.calls[1][0];
    expect(secondCallMessages).toHaveLength(4);
    expect(secondCallMessages[0]).toEqual({ role: "system", content: "You are a shell assistant." });
    expect(secondCallMessages[1]).toEqual(USER_MSG);
    expect(secondCallMessages[2].role).toBe("assistant");
    expect(secondCallMessages[3]).toEqual({ role: "tool", content: "result", toolCallId: "c1" });
  });

  // -- makeProvider mock exhausted --

  it("throws mock exhausted when provider runs out of responses", async () => {
    const provider = makeProvider([{ type: "text", content: "Only one" }]);
    const registry = makeRegistry();

    // First call succeeds
    const events1 = await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));
    expect(events1[0]).toEqual({ type: "text", content: "Only one" });

    // Second call: the mock is exhausted, so the provider throws
    const events2 = await collect(runLoop({ provider, registry, config: BASE_CONFIG, messages: [USER_MSG] }));
    expect(events2).toEqual([
      { type: "error", message: "mock exhausted" },
      { type: "done" },
    ]);
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
    expect(events.some((e) => e.type === "text")).toBe(true);
  }, 30000);
});
