import { describe, it, expect, vi, beforeEach } from "vitest";
import { OllamaProvider } from "./ollama";
import type { ProviderEvent } from "./types";
import type { Message, ToolDefinitionForLLM } from "@/lib/engine/types";

const MODEL = "qwen2.5-coder";

const tools: ToolDefinitionForLLM[] = [
  {
    name: "bash",
    description: "Run a shell command",
    parameters: { type: "object", properties: { cmd: { type: "string" } } },
  },
];

// Encode NDJSON lines into a ReadableStream body mock.
// Each line is a JSON object; final frame has done:true.
function ndjsonStream(frames: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));
      }
      controller.close();
    },
  });
}

// Mock fetch returning a streaming response with NDJSON body.
function mockStreamFetch(frames: object[], status = 200) {
  const body = ndjsonStream(frames);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body,
    text: () => Promise.resolve(frames.map((f) => JSON.stringify(f)).join("\n")),
  });
}

// Error mock: no streaming body, just text().
function mockErrorFetch(responseText: string, status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    body: null,
    text: () => Promise.resolve(responseText),
  });
}

async function collect(gen: AsyncGenerator<ProviderEvent>): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

// Build a minimal streaming Ollama response from content deltas.
function deltaFrames(chunks: string[]): object[] {
  return [
    ...chunks.map((content) => ({ message: { role: "assistant", content }, done: false })),
    { message: { role: "assistant", content: "" }, done: true },
  ];
}

describe("OllamaProvider", () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider({ model: MODEL });
    vi.restoreAllMocks();
  });

  // -- Request shape --

  it("sends correct request body (model, messages, tools, stream:true)", async () => {
    const fetch = mockStreamFetch(deltaFrames(["Hi"]));
    vi.stubGlobal("fetch", fetch);

    const messages: Message[] = [{ role: "user", content: "Hello" }];
    await collect(provider.chat(messages, tools, MODEL));

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");

    const body = JSON.parse(init.body);
    expect(body.model).toBe(MODEL);
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "bash",
          description: "Run a shell command",
          parameters: { type: "object", properties: { cmd: { type: "string" } } },
        },
      },
    ]);
  });

  it("uses model argument over constructor default", async () => {
    const fetch = mockStreamFetch(deltaFrames(["Hi"]));
    vi.stubGlobal("fetch", fetch);

    await collect(provider.chat([], [], "llama3.1"));

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.model).toBe("llama3.1");
  });

  // -- Text streaming --

  it("streams text content as text_delta events", async () => {
    vi.stubGlobal("fetch", mockStreamFetch(deltaFrames(["Hello", " world"])));

    const events = await collect(provider.chat([], [], MODEL));
    const deltas = events.filter((e) => e.type === "text_delta");
    expect(deltas).toEqual([
      { type: "text_delta", content: "Hello" },
      { type: "text_delta", content: " world" },
    ]);
  });

  it("no think tags yields everything as text_delta", async () => {
    vi.stubGlobal("fetch", mockStreamFetch(deltaFrames(["plain text response"])));

    const events = await collect(provider.chat([], [], MODEL));
    expect(events).toEqual([{ type: "text_delta", content: "plain text response" }]);
  });

  // -- Think-tag parsing --

  it("parses think tags into thinking events", async () => {
    vi.stubGlobal(
      "fetch",
      mockStreamFetch(deltaFrames(["<think>reasoning here</think>answer"]))
    );

    const events = await collect(provider.chat([], [], MODEL));
    expect(events).toEqual([
      { type: "thinking", content: "reasoning here" },
      { type: "text_delta", content: "answer" },
    ]);
  });

  it("content before think tags yields as text_delta", async () => {
    vi.stubGlobal(
      "fetch",
      mockStreamFetch(deltaFrames(["preamble<think>thought</think>answer"]))
    );

    const events = await collect(provider.chat([], [], MODEL));
    expect(events).toEqual([
      { type: "text_delta", content: "preamble" },
      { type: "thinking", content: "thought" },
      { type: "text_delta", content: "answer" },
    ]);
  });

  it("content after closing think tag yields as text_delta", async () => {
    vi.stubGlobal(
      "fetch",
      mockStreamFetch(deltaFrames(["<think>think</think>after content"]))
    );

    const events = await collect(provider.chat([], [], MODEL));
    const textDeltas = events.filter((e) => e.type === "text_delta");
    expect(textDeltas).toEqual([{ type: "text_delta", content: "after content" }]);
    expect(events.find((e) => e.type === "thinking")).toEqual({
      type: "thinking",
      content: "think",
    });
  });

  it("handles think tag split across NDJSON chunks", async () => {
    // Tag is split: "<thi" in first chunk, "nk>" in second, etc.
    const frames = [
      { message: { role: "assistant", content: "<thi" }, done: false },
      { message: { role: "assistant", content: "nk>reasoning</th" }, done: false },
      { message: { role: "assistant", content: "ink>done" }, done: false },
      { message: { role: "assistant", content: "" }, done: true },
    ];
    vi.stubGlobal("fetch", mockStreamFetch(frames));

    const events = await collect(provider.chat([], [], MODEL));
    expect(events).toEqual([
      { type: "thinking", content: "reasoning" },
      { type: "text_delta", content: "done" },
    ]);
  });

  // -- Tool calls --

  it("tool call response yields tool_calls event", async () => {
    const frames = [
      {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "bash", arguments: { cmd: "ls" } } }],
        },
        done: true,
      },
    ];
    vi.stubGlobal("fetch", mockStreamFetch(frames));

    const events = await collect(provider.chat([], tools, MODEL));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("tool_calls");
    if (events[0].type === "tool_calls") {
      expect(events[0].calls).toHaveLength(1);
      expect(events[0].calls[0].name).toBe("bash");
      expect(events[0].calls[0].arguments).toBe(JSON.stringify({ cmd: "ls" }));
    }
  });

  it("generates tool call IDs when Ollama doesn't provide them", async () => {
    const frames = [
      {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "bash", arguments: { cmd: "ls" } } }],
        },
        done: true,
      },
    ];
    vi.stubGlobal("fetch", mockStreamFetch(frames));

    const events = await collect(provider.chat([], tools, MODEL));
    expect(events[0].type).toBe("tool_calls");
    if (events[0].type === "tool_calls") {
      expect(typeof events[0].calls[0].id).toBe("string");
      expect(events[0].calls[0].id).toBeTruthy();
    }
  });

  it("handles arguments as a JSON string (some models return string not object)", async () => {
    const frames = [
      {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "bash", arguments: '{"cmd":"pwd"}' } }],
        },
        done: true,
      },
    ];
    vi.stubGlobal("fetch", mockStreamFetch(frames));

    const events = await collect(provider.chat([], tools, MODEL));
    expect(events[0].type).toBe("tool_calls");
    if (events[0].type === "tool_calls") {
      expect(events[0].calls[0].arguments).toBe('{"cmd":"pwd"}');
    }
  });

  // -- Tool result message formatting --

  it("formats tool result messages with tool_name for Ollama", async () => {
    const fetch = mockStreamFetch(deltaFrames(["Done"]));
    vi.stubGlobal("fetch", fetch);

    const messages: Message[] = [
      { role: "user", content: "Run ls" },
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "call_abc", name: "bash", arguments: '{"cmd":"ls"}' }],
      },
      { role: "tool", content: "file1.txt\nfile2.txt", toolCallId: "call_abc" },
    ];

    await collect(provider.chat(messages, tools, MODEL));

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const toolMsg = body.messages.find((m: Record<string, unknown>) => m.role === "tool");
    expect(toolMsg.tool_name).toBe("bash");
    expect(toolMsg.content).toBe("file1.txt\nfile2.txt");
  });

  // -- Custom base URL --

  it("custom base URL is used for the API call", async () => {
    const fetch = mockStreamFetch(deltaFrames(["Hi"]));
    vi.stubGlobal("fetch", fetch);

    const custom = new OllamaProvider({ model: MODEL, baseUrl: "http://192.168.1.10:11434" });
    await collect(custom.chat([], [], MODEL));

    expect(fetch.mock.calls[0][0]).toBe("http://192.168.1.10:11434/api/chat");
  });

  // -- Error handling --

  it("throws on non-200 responses with descriptive message", async () => {
    vi.stubGlobal("fetch", mockErrorFetch('{"error":"model not found"}', 404));

    await expect(collect(provider.chat([], [], MODEL))).rejects.toThrow(
      'Ollama request failed: 404 - {"error":"model not found"}'
    );
  });

  it("throws on network errors with descriptive message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(collect(provider.chat([], [], MODEL))).rejects.toThrow("Failed to fetch");
  });
});
