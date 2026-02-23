# Exploration: Looped - Local-First AI Agent Framework

**Date:** 2026-02-23
**Status:** Ready for planning

## Problem

There's no simple, local-first AI agent that runs on your machine with full autonomy. Existing tools either require cloud APIs, lock you into vendor abstractions, or give you a chat interface without real tool execution.

Developers and power users need an agent that can reason, act, and loop -- deciding what to do, running tools like bash and file operations, observing results, and continuing until the task is done. All running locally against Ollama models, with no data leaving the machine.

This project also serves as a portfolio piece demonstrating architecture skills, clean code patterns, and understanding of AI agent design -- while being genuinely useful as a day-to-day tool.

## Solution

Build **Looped**, an autonomous AI agent framework with a custom inference loop. The agent takes a user message, reasons about what to do, executes tools, feeds results back into context, and repeats until it produces a final response.

The core engine is a standalone TypeScript module (no framework dependency) that yields events as an async generator. A Next.js frontend provides the chat interface, with SSE streaming connecting the two. Conversations persist in SQLite so the agent can recall previous interactions.

The architecture is intentionally portable: the engine can be wrapped by Next.js today and Electron tomorrow without changes.

## Requirements

- [ ] Custom inference loop that runs LLM calls in a cycle until a text response is produced
- [ ] Async generator engine that yields typed events (thinking, tool_call, tool_result, text, error)
- [ ] Max iterations safety limit to prevent runaway loops
- [ ] Provider interface with OllamaProvider implementation
- [ ] Configurable model selection (user picks which Ollama model to use)
- [ ] Built-in bash tool for executing shell commands
- [ ] Built-in file read tool for reading file contents
- [ ] Built-in file write tool for writing/creating files
- [ ] Well-defined ToolDefinition interface for all tools
- [ ] Agent-first error handling: errors fed back as context for LLM to adapt and retry
- [ ] SSE streaming from API route to frontend with typed events
- [ ] Chat UI with message threads, code blocks, and tool call visualization
- [ ] shadcn/ui foundation with adapted AI Elements components
- [ ] SQLite database via Drizzle ORM for persistent conversation storage
- [ ] Conversation history recall across sessions
- [ ] Standalone engine module with no Next.js imports (portable for future Electron)

## Non-Requirements

- Not using Vercel AI SDK's `streamText` or `useChat` for the agent loop (the loop is the project)
- Not building an Electron app in phase 1
- Not implementing self-extending tools in phase 1 (agent creating its own tools is phase 2)
- Not adding OpenAI or Anthropic providers in phase 1
- Not implementing RAG or vector search for long-term memory in phase 1
- Not building multi-agent orchestration
- Not implementing user authentication or multi-user support

## Architecture

### System Overview

```
[Browser] <--SSE--> [Next.js API Route] --> [Engine] --> [OllamaProvider] --> [Ollama]
                                               |
                                               +--> [ToolRegistry] --> [bash/read/write]
                                               |
                                          [SQLite via Drizzle]
```

### Engine (lib/engine/)

The inference loop is a pure TypeScript async generator. It takes a configuration (provider, tools, messages, max iterations) and yields events as it works:

```
loop.ts        - Core inference loop (async generator)
types.ts       - LoopEvent, LoopConfig, Message, ToolCall types
adapters.ts    - Converts async generator to SSE stream (web adapter)
```

**Loop flow:**
1. Receive messages + tool definitions
2. Call provider.chat() with current context
3. If response is text -> yield text event, loop ends
4. If response is tool_calls -> yield tool_call event, execute tools, yield tool_result event
5. Append tool results to context, go to step 2
6. If max iterations reached -> yield error event, loop ends
7. If error occurs -> append error as context message, go to step 2 (agent handles errors)

### Provider Layer (lib/providers/)

```
types.ts       - Provider interface, LLMResponse type
ollama.ts      - OllamaProvider implementation (HTTP calls to Ollama API)
```

The Provider interface has a single method: `chat(messages, tools) -> LLMResponse`. The response is either `{ type: 'text', content: string }` or `{ type: 'tool_calls', calls: ToolCall[] }`.

### Tool System (lib/tools/)

```
types.ts       - ToolDefinition interface (name, description, parameters, execute)
registry.ts    - ToolRegistry class (register, lookup, list tools for LLM)
bash.ts        - Built-in bash tool
read-file.ts   - Built-in file read tool
write-file.ts  - Built-in file write tool
```

Tools follow a consistent interface: name, description, JSON schema parameters, and an async execute function. The registry collects tools and can serialize them for the LLM's tool format.

### Frontend (app/)

```
app/
  page.tsx              - Chat interface
  api/chat/route.ts     - API route (thin wrapper around engine)
components/
  chat/                 - Chat UI components (adapted AI Elements + shadcn)
    message-thread.tsx  - Scrollable message list
    message.tsx         - Individual message display
    tool-call.tsx       - Tool call/result visualization
    chat-input.tsx      - Message input with send button
    code-block.tsx      - Syntax-highlighted code display
lib/
  hooks/
    use-chat-stream.ts  - Custom hook for SSE consumption and state management
```

The API route receives messages, creates an engine instance, converts the async generator to an SSE stream, and returns it. The frontend consumes the stream via a custom `useChatStream` hook that manages message state and streaming updates.

### Data Layer (lib/db/)

```
schema.ts      - Drizzle schema (conversations, messages tables)
index.ts       - Database connection and query helpers
migrate.ts     - Migration runner
```

**Tables:**
- `conversations` - id, title, created_at, updated_at
- `messages` - id, conversation_id, role (user/assistant/tool), content, tool_calls (JSON), created_at

## Constraints

- Must work with Ollama running locally (default: http://localhost:11434)
- Engine module must have zero Next.js imports (portability requirement)
- All tool execution happens server-side in the API route (security)
- SSE streaming must handle connection drops gracefully
- SQLite database file stored in project directory
- Must work with Ollama models that support tool/function calling
- AI Elements components will need their useChat() wiring removed and replaced with custom state

## Success Criteria

- [ ] User can send a message and receive a streamed response from Ollama
- [ ] Agent autonomously decides to use tools when appropriate (e.g., "list files in this directory" triggers bash)
- [ ] Tool calls and results are visible in the chat UI in real-time
- [ ] Agent handles tool errors by adapting its approach (not crashing)
- [ ] Loop respects max iterations limit
- [ ] Conversations persist across page refreshes (SQLite)
- [ ] User can start new conversations and switch between previous ones
- [ ] Engine runs independently of Next.js (can be imported and tested in isolation)
- [ ] Streaming works smoothly with no dropped events or UI glitches

## Open Questions

1. **Which Ollama models support tool calling well?** -- Need to test qwen2.5-coder, llama3.1, and others to find the best default. Some models handle structured tool call output better than others.
2. **AI Elements adaptation complexity** -- How much work is it to strip useChat() from AI Elements components? May need to evaluate during implementation and fall back to pure shadcn if it's too coupled.
3. **Context window management** -- When conversations get long, how do we handle exceeding the model's context window? Truncation strategy or summarization? (Can defer to phase 2 if basic truncation works for now.)
4. **Ollama streaming** -- Should the engine stream token-by-token from Ollama, or wait for complete responses per loop iteration? Token streaming gives better UX but adds complexity.

## Next Steps

1. `/plan` to create implementation tasks and Beads for phase 1
2. Verify Ollama tool calling works with target models before committing to the tool format
3. Install Next.js, shadcn/ui, and AI Elements to validate the component adaptation approach
