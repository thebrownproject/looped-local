import type { LoopEvent } from "./types";

function encodeFrame(event: LoopEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Converts an AsyncGenerator<LoopEvent> into a ReadableStream of SSE frames.
 * Optional onCancel is called when the client disconnects.
 */
export function loopToSSEStream(
  gen: AsyncGenerator<LoopEvent>,
  onCancel?: () => void
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await gen.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encodeFrame(value));
        if (value.type === "done") controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encodeFrame({ type: "error", message: msg }));
        controller.close();
      }
    },
    cancel() {
      onCancel?.();
    },
  });
}
