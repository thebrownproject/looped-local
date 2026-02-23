# Looped

**Your local AI agent. Your rules. Your machine.**

An autonomous AI agent that runs a custom inference loop against local Ollama models. It pulls context, decides whether to use a tool, executes it, feeds the result back, and keeps going until it has a real answer. Everything runs locally. No cloud APIs, no telemetry, no middleman.

## How it works

You type a message. The agent sends it to a local Ollama model. If the model decides it needs to run a bash command, read a file, or write something to disk, it does. The result goes back into context and the model gets another turn. This loop continues until the model has enough information to respond with text.

The whole interaction streams to the browser in real time via Server-Sent Events. You see tool calls appear as they happen, terminal output with full ANSI colour support, and the final response as it's generated.

## Tech Stack

**Runtime:** Next.js 16 (App Router) · TypeScript · React 19 <br>
**AI:** Ollama (local) · Custom inference loop (async generator) <br>
**Tools:** Bash execution · File read/write · Extensible tool registry <br>
**Database:** SQLite via Drizzle ORM · WAL mode · Persistent conversations <br>
**UI:** Vercel AI Elements (shadcn-style) · Tailwind CSS v4 · SSE streaming <br>
**Testing:** Vitest · 126 tests · React Testing Library

## Architecture

The engine is a standalone TypeScript module with zero Next.js imports. It's an async generator that yields typed events (`text`, `tool_call`, `tool_result`, `error`, `done`) as the loop progresses. This makes it portable for future runtimes (Electron, CLI) without touching the core logic.

```
Browser ──POST──▸ /api/chat ──▸ runLoop() ──▸ OllamaProvider.chat()
   ◂──SSE──────── adapters ◂──── yield ◂────── ToolRegistry.execute()
```

The provider layer normalises Ollama's wire format into a standard `LLMResponse` type. The tool system uses a registry pattern with dependency injection for testability. The SSE adapter converts the generator's events into a `ReadableStream` for the API route.

On the frontend, a custom `useAgentChat` hook manages the SSE connection and maps `LoopEvent` types to AI Elements component state, keeping the UI components decoupled from any specific AI SDK.

## Run locally

**Requires:** Node.js 20+, [Ollama](https://ollama.com) installed and running

```bash
git clone https://github.com/thebrownproject/looped
cd looped
npm install
```

Pull a model:

```bash
ollama pull qwen2.5-coder    # recommended
ollama pull llama3.1          # alternative
```

Start the dev server:

```bash
npm run dev    # http://localhost:3000
```

## Project Structure

```
src/
├── app/
│   ├── api/chat/           # SSE streaming endpoint
│   ├── api/conversations/  # CRUD for conversation history
│   └── page.tsx            # Chat UI
├── lib/
│   ├── engine/
│   │   ├── types.ts        # Core types (LoopEvent, Message, ToolCall)
│   │   ├── loop.ts         # Inference loop (async generator)
│   │   └── adapters.ts     # Generator → SSE stream
│   ├── providers/
│   │   └── ollama.ts       # Ollama API client
│   ├── tools/
│   │   ├── registry.ts     # Tool registration and dispatch
│   │   ├── bash.ts         # Shell command execution
│   │   ├── read-file.ts    # File reading
│   │   └── write-file.ts   # File writing
│   ├── db/
│   │   ├── schema.ts       # Drizzle schema (conversations + messages)
│   │   └── queries.ts      # Database operations
│   └── hooks/
│       └── use-agent-chat.ts  # SSE client hook
└── components/
    ├── chat/               # Chat UI components
    └── ai-elements/        # Vercel AI Elements (installed as source)
```

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm test` | Run all 126 tests |
| `npm run test:watch` | Watch mode |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:studio` | Open Drizzle Studio |

## Why this project

Most AI chat apps wrap an API call and render the response. Looped builds the inference loop from scratch. The loop itself is the product: an async generator that orchestrates LLM calls, tool execution, error recovery, and context accumulation in a portable, testable module.

This demonstrates:

- Designing a standalone engine module that's decoupled from the web framework
- Building a custom provider abstraction over LLM APIs (Ollama first, OpenAI/Anthropic ready)
- Implementing a tool system with dependency injection and runtime safety (timeout clamping, error-as-context)
- Streaming architecture with SSE, generator-to-stream adapters, and proper cleanup on disconnect
- Adapting Vercel AI Elements to work with a custom hook instead of the standard `useChat`
- SQLite persistence with Drizzle ORM, including full conversation history with tool call context
