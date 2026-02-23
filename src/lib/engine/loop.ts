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
  // Spread to avoid mutating the caller's array
  const ctx: Message[] = config.systemPrompt
    ? [{ role: "system", content: config.systemPrompt }, ...messages]
    : [...messages];

  const tools = registry.toToolDefinitions();

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    let response;
    try {
      response = await provider.chat(ctx, tools, config.model);
    } catch (err) {
      yield { type: "error", message: err instanceof Error ? err.message : String(err) };
      yield { type: "done" };
      return;
    }

    if (response.type === "text") {
      yield { type: "text", content: response.content };
      yield { type: "done" };
      return;
    }

    // Process tool calls batch
    const assistantMsg: Message = {
      role: "assistant",
      content: null,
      toolCalls: response.calls,
    };
    ctx.push(assistantMsg);

    for (const call of response.calls) {
      yield { type: "tool_call", call };

      const result = await executeToolSafe(registry, call);
      yield { type: "tool_result", callId: call.id, result };

      ctx.push({ role: "tool", content: result, toolCallId: call.id });
    }
  }

  yield { type: "error", message: "Max iterations reached" };
  yield { type: "done" };
}

async function executeToolSafe(registry: ToolRegistry, call: ToolCall): Promise<string> {
  try {
    return await registry.execute(call.name, call.arguments);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
