import { describe, it, expect, vi, beforeEach } from "vitest";
import { OllamaProvider } from "./ollama";
import type { Message, ToolDefinitionForLLM } from "@/lib/engine/types";

const MODEL = "qwen2.5-coder";

const tools: ToolDefinitionForLLM[] = [
  {
    name: "bash",
    description: "Run a shell command",
    parameters: { type: "object", properties: { cmd: { type: "string" } } },
  },
];

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("OllamaProvider", () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider({ model: MODEL });
    vi.restoreAllMocks();
  });

  // -- Request shape --

  it("sends correct request body (model, messages, tools, stream:false)", async () => {
    const fetch = mockFetch({ message: { role: "assistant", content: "Hi", tool_calls: null } });
    vi.stubGlobal("fetch", fetch);

    const messages: Message[] = [{ role: "user", content: "Hello" }];
    await provider.chat(messages, tools, MODEL);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");

    const body = JSON.parse(init.body);
    expect(body.model).toBe(MODEL);
    expect(body.stream).toBe(false);
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
    const fetch = mockFetch({ message: { role: "assistant", content: "Hi", tool_calls: null } });
    vi.stubGlobal("fetch", fetch);

    await provider.chat([], [], "llama3.1");

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.model).toBe("llama3.1");
  });

  // -- Text response parsing --

  it("parses text response into { type: 'text', content }", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ message: { role: "assistant", content: "Hello world", tool_calls: null } })
    );

    const result = await provider.chat([], [], MODEL);
    expect(result).toEqual({ type: "text", content: "Hello world" });
  });

  it("parses text response when tool_calls is undefined", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ message: { role: "assistant", content: "Hello" } })
    );

    const result = await provider.chat([], [], MODEL);
    expect(result).toEqual({ type: "text", content: "Hello" });
  });

  // -- Tool call response parsing --

  it("parses tool call response into { type: 'tool_calls', calls }", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "bash", arguments: { cmd: "ls" } } }],
        },
      })
    );

    const result = await provider.chat([], tools, MODEL);
    expect(result.type).toBe("tool_calls");
    if (result.type === "tool_calls") {
      expect(result.calls).toHaveLength(1);
      expect(result.calls[0].name).toBe("bash");
      expect(result.calls[0].arguments).toBe(JSON.stringify({ cmd: "ls" }));
    }
  });

  // -- Tool call ID generation --

  it("generates tool call IDs when Ollama doesn't provide them", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "bash", arguments: { cmd: "ls" } } }],
        },
      })
    );

    const result = await provider.chat([], tools, MODEL);
    expect(result.type).toBe("tool_calls");
    if (result.type === "tool_calls") {
      expect(result.calls[0].id).toBeTruthy();
      expect(typeof result.calls[0].id).toBe("string");
    }
  });

  it("handles arguments as a JSON string (some models return string not object)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "bash", arguments: '{"cmd":"pwd"}' } }],
        },
      })
    );

    const result = await provider.chat([], tools, MODEL);
    expect(result.type).toBe("tool_calls");
    if (result.type === "tool_calls") {
      expect(result.calls[0].arguments).toBe('{"cmd":"pwd"}');
    }
  });

  // -- Tool result message formatting --

  it("formats tool result messages with tool_name for Ollama", async () => {
    const fetch = mockFetch({ message: { role: "assistant", content: "Done", tool_calls: null } });
    vi.stubGlobal("fetch", fetch);

    // Prior assistant message contains the tool call so the provider can look up the name
    const messages: Message[] = [
      { role: "user", content: "Run ls" },
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "call_abc", name: "bash", arguments: '{"cmd":"ls"}' }],
      },
      { role: "tool", content: "file1.txt\nfile2.txt", toolCallId: "call_abc" },
    ];

    await provider.chat(messages, tools, MODEL);

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const toolMsg = body.messages.find((m: Record<string, unknown>) => m.role === "tool");
    expect(toolMsg.tool_name).toBe("bash");
    expect(toolMsg.content).toBe("file1.txt\nfile2.txt");
  });

  // -- Custom base URL --

  it("custom base URL is used for the API call", async () => {
    const fetch = mockFetch({ message: { role: "assistant", content: "Hi", tool_calls: null } });
    vi.stubGlobal("fetch", fetch);

    const custom = new OllamaProvider({ model: MODEL, baseUrl: "http://192.168.1.10:11434" });
    await custom.chat([], [], MODEL);

    expect(fetch.mock.calls[0][0]).toBe("http://192.168.1.10:11434/api/chat");
  });

  // -- Error handling --

  it("throws on non-200 responses with descriptive message", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "model not found" }, 404));

    await expect(provider.chat([], [], MODEL)).rejects.toThrow(
      'Ollama request failed: 404 - {"error":"model not found"}'
    );
  });

  it("throws on network errors with descriptive message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );

    await expect(provider.chat([], [], MODEL)).rejects.toThrow("Failed to fetch");
  });
});
