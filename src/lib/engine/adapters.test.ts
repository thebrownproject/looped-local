// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { loopToSSEStream } from "./adapters";
import type { LoopEvent } from "./types";

async function* makeGen(events: LoopEvent[]): AsyncGenerator<LoopEvent> {
  for (const e of events) yield e;
}

async function* errorGen(events: LoopEvent[], afterIndex: number): AsyncGenerator<LoopEvent> {
  for (let i = 0; i < events.length; i++) {
    if (i === afterIndex) throw new Error("Generator boom");
    yield events[i];
  }
}

/** Collect all SSE frames from the stream as decoded strings */
async function collectFrames(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const frames: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    frames.push(decoder.decode(value));
  }
  return frames;
}

describe("loopToSSEStream", () => {
  it("formats text event as SSE frame", async () => {
    const stream = loopToSSEStream(makeGen([{ type: "text", content: "Hello" }, { type: "done" }]));
    const frames = await collectFrames(stream);
    expect(frames[0]).toBe('data: {"type":"text","content":"Hello"}\n\n');
  });

  it("formats tool_call event as SSE frame", async () => {
    const call = { id: "c1", name: "bash", arguments: '{"cmd":"ls"}' };
    const stream = loopToSSEStream(makeGen([{ type: "tool_call", call }, { type: "done" }]));
    const frames = await collectFrames(stream);
    expect(frames[0]).toBe(`data: ${JSON.stringify({ type: "tool_call", call })}\n\n`);
  });

  it("formats tool_result event as SSE frame", async () => {
    const stream = loopToSSEStream(
      makeGen([{ type: "tool_result", callId: "c1", result: "ok" }, { type: "done" }])
    );
    const frames = await collectFrames(stream);
    expect(frames[0]).toBe('data: {"type":"tool_result","callId":"c1","result":"ok"}\n\n');
  });

  it("formats error event as SSE frame", async () => {
    const stream = loopToSSEStream(makeGen([{ type: "error", message: "oops" }, { type: "done" }]));
    const frames = await collectFrames(stream);
    expect(frames[0]).toBe('data: {"type":"error","message":"oops"}\n\n');
  });

  it("formats done event and closes stream", async () => {
    const stream = loopToSSEStream(makeGen([{ type: "done" }]));
    const frames = await collectFrames(stream);
    expect(frames[frames.length - 1]).toBe('data: {"type":"done"}\n\n');
  });

  it("emits all event types in order", async () => {
    const call = { id: "c1", name: "bash", arguments: "{}" };
    const events: LoopEvent[] = [
      { type: "tool_call", call },
      { type: "tool_result", callId: "c1", result: "r" },
      { type: "text", content: "done" },
      { type: "done" },
    ];
    const stream = loopToSSEStream(makeGen(events));
    const frames = await collectFrames(stream);
    expect(frames).toHaveLength(4);
    expect(JSON.parse(frames[0].replace("data: ", "").trim()).type).toBe("tool_call");
    expect(JSON.parse(frames[1].replace("data: ", "").trim()).type).toBe("tool_result");
    expect(JSON.parse(frames[2].replace("data: ", "").trim()).type).toBe("text");
    expect(JSON.parse(frames[3].replace("data: ", "").trim()).type).toBe("done");
  });

  it("emits an error frame when generator throws", async () => {
    const events: LoopEvent[] = [{ type: "text", content: "before" }, { type: "done" }];
    const stream = loopToSSEStream(errorGen(events, 1));
    const frames = await collectFrames(stream);
    // Should have the text frame plus an error frame
    const parsed = frames.map((f) => JSON.parse(f.replace("data: ", "").trim()));
    expect(parsed.some((e) => e.type === "error")).toBe(true);
  });

  it("cancel handler is called on stream cancel", async () => {
    const onCancel = vi.fn();
    async function* longGen(): AsyncGenerator<LoopEvent> {
      yield { type: "text", content: "first" };
      await new Promise((r) => setTimeout(r, 10000)); // never resolves in test
      yield { type: "done" };
    }
    const stream = loopToSSEStream(longGen(), onCancel);
    const reader = stream.getReader();
    await reader.read(); // consume first frame
    await reader.cancel();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
