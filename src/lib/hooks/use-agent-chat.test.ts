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

  it("sets status to error and adds error message on fetch failure", async () => {
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
});
