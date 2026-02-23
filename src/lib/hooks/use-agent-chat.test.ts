import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAgentChat } from "./use-agent-chat";

// Helper to build a ReadableStream from SSE frames
function sseStream(events: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const frames = events.map((e) => encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < frames.length) {
        controller.enqueue(frames[i++]);
      } else {
        controller.close();
      }
    },
  });
}

// Build a stream from raw byte chunks for testing SSE edge cases
function rawStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
      } else {
        controller.close();
      }
    },
  });
}

function mockFetch(events: object[]) {
  vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok: true,
    body: sseStream(events),
  } as unknown as Response);
}

describe("useAgentChat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with empty messages and ready status", () => {
    const { result } = renderHook(() => useAgentChat());
    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe("ready");
  });

  it("adds user message and transitions to submitted on sendMessage", async () => {
    mockFetch([{ type: "done" }]);
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("hello");
  });

  it("accumulates text events into assistant message", async () => {
    mockFetch([
      { type: "text", content: "Hello " },
      { type: "text", content: "world" },
      { type: "done" },
    ]);
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("Hello world");
  });

  it("creates tool parts from tool_call and tool_result events", async () => {
    mockFetch([
      { type: "tool_call", call: { id: "c1", name: "bash", arguments: '{"cmd":"ls"}' } },
      { type: "tool_result", callId: "c1", result: "file.txt" },
      { type: "done" },
    ]);
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("list files");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant?.toolParts).toHaveLength(1);
    expect(assistant?.toolParts?.[0].state).toBe("output-available");
    expect(assistant?.toolParts?.[0].toolName).toBe("bash");
  });

  it("sets status back to ready after done event", async () => {
    mockFetch([{ type: "text", content: "ok" }, { type: "done" }]);
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("test");
    });

    expect(result.current.status).toBe("ready");
  });

  it("sets status to error on fetch network failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("network error"));
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("fail");
    });

    expect(result.current.status).toBe("error");
  });

  it("sets status to error on non-ok response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      body: null,
    } as unknown as Response);
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("fail");
    });

    expect(result.current.status).toBe("error");
  });

  it("sets status to error on SSE error event", async () => {
    mockFetch([{ type: "error", message: "something went wrong" }]);
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("fail");
    });

    expect(result.current.status).toBe("error");
  });

  it("passes conversationId on follow-up messages", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy.mockResolvedValue({
      ok: true,
      body: sseStream([{ type: "text", content: "hi" }, { type: "done" }]),
    } as unknown as Response);

    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      result.current.setConversationId("conv-123");
      await result.current.sendMessage("second message");
    });

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.conversationId).toBe("conv-123");
  });

  it("loads history from API when initialConversationId is provided", async () => {
    const storedMessages = [
      { id: "m1", role: "user", content: "hello", toolCalls: undefined },
      { id: "m2", role: "assistant", content: "hi there", toolCalls: undefined },
    ];
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ conversation: { id: "conv-abc" }, messages: storedMessages }),
    } as unknown as Response);

    const { result } = renderHook(() => useAgentChat("conv-abc"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("hello");
    expect(result.current.messages[1].role).toBe("assistant");
    expect(result.current.messages[1].content).toBe("hi there");
  });

  it("populates tool output from tool-role rows when loading history", async () => {
    const storedMessages = [
      { id: "m1", role: "user", content: "run ls" },
      {
        id: "m2",
        role: "assistant",
        content: null,
        toolCalls: [{ id: "c1", name: "bash", arguments: '{"cmd":"ls"}' }],
      },
      { id: "m3", role: "tool", content: "file.txt", toolCallId: "c1" },
    ];
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ conversation: { id: "conv-xyz" }, messages: storedMessages }),
    } as unknown as Response);

    const { result } = renderHook(() => useAgentChat("conv-xyz"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.messages).toHaveLength(2);
    const assistant = result.current.messages[1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.toolParts).toHaveLength(1);
    expect(assistant.toolParts?.[0].toolName).toBe("bash");
    expect(assistant.toolParts?.[0].state).toBe("output-available");
    expect(assistant.toolParts?.[0].output).toBe("file.txt");
  });

  it("captures conversationId from conversation event", async () => {
    mockFetch([
      { type: "conversation", conversationId: "new-conv-id" },
      { type: "text", content: "hi" },
      { type: "done" },
    ]);
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    expect(result.current.conversationId).toBe("new-conv-id");
  });

  // Bug 2: concurrent send guard
  it("ignores concurrent sendMessage calls while streaming", async () => {
    let resolveStream: (() => void) | undefined;
    const slowStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content: "hello" })}\n\n`));
        // Hold the stream open until we resolve
        await new Promise<void>((r) => { resolveStream = r; });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      },
    });

    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy.mockResolvedValueOnce({ ok: true, body: slowStream } as unknown as Response);

    const { result } = renderHook(() => useAgentChat());

    // Start first message (will be streaming)
    const firstSend = act(async () => {
      await result.current.sendMessage("first");
    });

    // Wait a tick for the first send to start streaming
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Second call should be ignored since status is not "ready"
    await act(async () => {
      await result.current.sendMessage("second");
    });

    // Finish the stream
    resolveStream?.();
    await firstSend;

    // Should only have one user message (the "first" one)
    const userMessages = result.current.messages.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0].content).toBe("first");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // Bug 1: abort on unmount
  it("aborts fetch on unmount during streaming", async () => {
    let abortSignal: AbortSignal | undefined;
    const neverEndingStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content: "hi" })}\n\n`));
        // Never close - simulates a long-running stream
      },
    });

    vi.spyOn(global, "fetch").mockImplementation(async (_url, opts) => {
      abortSignal = (opts as RequestInit)?.signal as AbortSignal;
      return { ok: true, body: neverEndingStream } as unknown as Response;
    });

    const { result, unmount } = renderHook(() => useAgentChat());

    // Start streaming (don't await - it will hang)
    act(() => {
      result.current.sendMessage("hello");
    });

    // Wait for fetch to be called
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(abortSignal).toBeDefined();
    expect(abortSignal!.aborted).toBe(false);

    unmount();

    expect(abortSignal!.aborted).toBe(true);
  });

  // Bug 3: SSE parser handles trailing buffer without \n\n
  it("parses final SSE event without trailing newlines", async () => {
    const encoder = new TextEncoder();
    // Send a done event without trailing \n\n
    const chunk = encoder.encode(`data: ${JSON.stringify({ type: "text", content: "final" })}\n\ndata: ${JSON.stringify({ type: "done" })}`);

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      body: rawStream([chunk]),
    } as unknown as Response);

    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("test");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("final");
    expect(result.current.status).toBe("ready");
  });

  // SSE edge case: frames split across chunks
  it("handles SSE frames split across multiple chunks", async () => {
    const encoder = new TextEncoder();
    const fullFrame = `data: ${JSON.stringify({ type: "text", content: "split" })}\n\ndata: ${JSON.stringify({ type: "done" })}\n\n`;
    // Split the frame in the middle
    const mid = Math.floor(fullFrame.length / 2);
    const chunk1 = encoder.encode(fullFrame.slice(0, mid));
    const chunk2 = encoder.encode(fullFrame.slice(mid));

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      body: rawStream([chunk1, chunk2]),
    } as unknown as Response);

    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("test");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("split");
    expect(result.current.status).toBe("ready");
  });

  // SSE edge case: multiple frames in a single chunk
  it("handles multiple SSE frames in a single chunk", async () => {
    const encoder = new TextEncoder();
    const combined = [
      `data: ${JSON.stringify({ type: "text", content: "A" })}\n\n`,
      `data: ${JSON.stringify({ type: "text", content: "B" })}\n\n`,
      `data: ${JSON.stringify({ type: "done" })}\n\n`,
    ].join("");

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      body: rawStream([encoder.encode(combined)]),
    } as unknown as Response);

    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("test");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("AB");
    expect(result.current.status).toBe("ready");
  });
});
