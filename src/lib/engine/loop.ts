import type { LoopConfig, LoopEvent, Message, ToolCall } from "@/lib/engine/types";
import type { Provider } from "@/lib/providers/types";
import type { ToolRegistry } from "@/lib/tools/registry";

export interface LoopInput {
  provider: Provider;
  registry: ToolRegistry;
  config: LoopConfig;
  messages: Message[];
}

export async function* runLoop({ provider, registry, config, messages }: LoopInput): AsyncGenerator<LoopEvent> {
  if (config.maxIterations <= 0) {
    yield { type: "error", message: "Invalid maxIterations" };
    yield { type: "done" };
    return;
  }

  const ctx: Message[] = config.systemPrompt
    ? [{ role: "system", content: config.systemPrompt }, ...messages]
    : [...messages];

  const tools = registry.toToolDefinitions();

  try {
    for (let iteration = 0; iteration < config.maxIterations; iteration++) {
      let toolCalls: ToolCall[] | null = null;
      let accumulatedText = "";

      try {
        for await (const event of provider.chat(ctx, tools, config.model)) {
          if (event.type === "thinking" || event.type === "text_delta") {
            yield event;
            if (event.type === "text_delta") accumulatedText += event.content;
          } else if (event.type === "tool_calls") {
            toolCalls = event.calls;
            break;
          }
        }
      } catch (err) {
        yield { type: "error", message: err instanceof Error ? err.message : String(err) };
        yield { type: "done" };
        return;
      }

      if (toolCalls === null) {
        // Stream ended with text -- yield terminal text event for compat and exit
        if (accumulatedText) yield { type: "text", content: accumulatedText };
        yield { type: "done" };
        return;
      }

      if (toolCalls.length === 0) {
        yield { type: "error", message: "Provider returned empty tool_calls" };
        yield { type: "done" };
        return;
      }

      const assistantMsg: Message = {
        role: "assistant",
        content: null,
        toolCalls,
      };
      ctx.push(assistantMsg);

      for (const call of toolCalls) {
        yield { type: "tool_call", call };
        const result = await executeToolSafe(registry, call);
        yield { type: "tool_result", callId: call.id, result };
        ctx.push({ role: "tool", content: result, toolCallId: call.id });
      }
    }

    yield { type: "error", message: "Max iterations reached" };
    yield { type: "done" };
  } finally {
    // Generator cleanup: release resources when consumer stops iterating early
  }
}

async function executeToolSafe(registry: ToolRegistry, call: ToolCall): Promise<string> {
  try {
    return await registry.execute(call.name, call.arguments);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
