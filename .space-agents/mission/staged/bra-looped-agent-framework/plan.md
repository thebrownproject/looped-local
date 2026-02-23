# Feature: Looped - Local-First AI Agent Framework (Phase 1)

**Goal:** Build an autonomous AI agent with a custom inference loop, tool execution, SSE streaming, persistent conversations, and a polished chat UI, all running locally against Ollama.

## Overview

Looped is a local-first AI agent framework where the core differentiator is the inference loop itself. The agent receives a user message, reasons about what to do, executes tools (bash, file read/write), feeds results back into context, and repeats until it produces a final response.

The architecture is layered and portable: a standalone TypeScript engine (no Next.js dependency) wrapped by a Next.js API route for the web version. Conversations persist in SQLite via Drizzle ORM. The frontend uses shadcn/ui with adapted AI Elements components for a polished chat experience.

Phase 1 delivers the complete working agent: engine, Ollama provider, tools, streaming, persistence, and chat UI.

## Tasks

### Task: Project Scaffold and Core Types

**Goal:** Initialize the Next.js project with all dependencies and define the shared type system that every other task depends on.
**Files:** Create package.json (via create-next-app), tsconfig.json, vitest.config.ts, lib/engine/types.ts, lib/providers/types.ts, lib/tools/types.ts
**Depends on:** None

**Steps:**
1. Scaffold Next.js project with App Router, TypeScript, Tailwind CSS, ESLint
2. Install dev dependencies: vitest, @testing-library/react, @testing-library/jest-dom
3. Install project dependencies: drizzle-orm, better-sqlite3, drizzle-kit, @types/better-sqlite3
4. Configure vitest with path aliases matching tsconfig
5. Define engine types in lib/engine/types.ts: Message, MessageRole, ToolCall, LoopEvent (union type with thinking/text/tool_call/tool_result/error/done variants), LoopConfig, ToolDefinitionForLLM, LLMResponse
6. Define provider types in lib/providers/types.ts: Provider interface with chat() method
7. Define tool types in lib/tools/types.ts: ToolDefinition interface (name, description, parameters, execute)
8. Structure types to avoid circular imports: engine/types.ts is the root, provider and tool types import from it
9. Create directory structure: lib/engine/, lib/providers/, lib/tools/, lib/db/, lib/hooks/, components/chat/
10. Initialize git repository with .gitignore (include .test-tmp, looped.db*, node_modules)
11. Verify project builds and test runner works

**Tests:**
- [ ] Project compiles with `npm run build` (no type errors)
- [ ] Vitest runs successfully
- [ ] All type files are importable from their paths
- [ ] No circular import errors
- [ ] Engine types have zero Next.js imports

### Task: Provider Layer - OllamaProvider

**Goal:** Implement the Provider interface and OllamaProvider class that makes HTTP calls to Ollama's /api/chat endpoint and normalizes responses.
**Files:** Create lib/providers/ollama.ts, lib/providers/ollama.test.ts, lib/providers/index.ts
**Depends on:** Project Scaffold and Core Types

**Steps:**
1. Write test: OllamaProvider sends correct request format to /api/chat (mock fetch)
2. Implement OllamaProvider with constructor accepting model name and optional base URL
3. Write test: returns text LLMResponse when Ollama responds with content
4. Write test: returns tool_calls LLMResponse when Ollama responds with tool calls
5. Implement parseResponse that normalizes Ollama's response format into our LLMResponse type
6. Write test: handles tool call arguments as both object (Ollama default) and string (fallback)
7. Write test: generates unique tool call IDs (Ollama doesn't provide them)
8. Write test: formats tool result messages correctly for Ollama's expected format
9. Write test: throws typed error on non-200 response
10. Write test: throws on network error (Ollama not running)
11. Write test: uses custom base URL when provided
12. Write test: passes tool definitions in Ollama's expected format
13. Manually test against real Ollama instance to verify tool calling works with target model

**Tests:**
- [ ] Provider sends correct request body to Ollama (model, messages, tools, stream:false)
- [ ] Text response parsed correctly into { type: 'text', content: '...' }
- [ ] Tool call response parsed correctly into { type: 'tool_calls', calls: [...] }
- [ ] Tool call IDs are generated when Ollama doesn't provide them
- [ ] Network errors throw with descriptive messages
- [ ] Non-200 responses throw with status code
- [ ] Custom base URL works
- [ ] Tool result messages formatted correctly for Ollama

### Task: Tool System - Registry and Built-in Tools

**Goal:** Implement the ToolRegistry class and three built-in tools (bash, read_file, write_file) with full test coverage.
**Files:** Create lib/tools/registry.ts, lib/tools/registry.test.ts, lib/tools/bash.ts, lib/tools/bash.test.ts, lib/tools/read-file.ts, lib/tools/read-file.test.ts, lib/tools/write-file.ts, lib/tools/write-file.test.ts, lib/tools/index.ts
**Depends on:** Project Scaffold and Core Types

**Steps:**
1. Write tests for ToolRegistry: register, get by name, list all, toToolDefinitions (serialize to LLM format), execute by name, error on unknown tool
2. Implement ToolRegistry class with Map-based storage
3. Write tests for bash tool: executes command and returns stdout, returns stderr on failure, handles timeout (SIGTERM), requires command argument
4. Implement bash tool using child_process exec with timeout support
5. Write tests for read_file tool: reads file contents, returns error for missing file, requires path argument
6. Implement read_file tool using fs/promises readFile
7. Write tests for write_file tool: writes content, creates parent directories, requires path and content arguments
8. Implement write_file tool using fs/promises writeFile with recursive mkdir
9. Create index.ts that exports a factory function creating a registry with all built-in tools
10. Ensure all tool execute functions return strings (never throw) -- errors are descriptive strings for the LLM

**Tests:**
- [ ] Registry registers, retrieves, lists, and serializes tools
- [ ] Registry throws on execute of unknown tool
- [ ] Bash tool executes commands and returns stdout
- [ ] Bash tool returns stderr on command failure (not throwing)
- [ ] Bash tool respects timeout limit
- [ ] Read file tool reads existing files
- [ ] Read file tool returns error string for missing files
- [ ] Write file tool creates files and parent directories
- [ ] All tools validate required arguments

### Task: Inference Loop Engine

**Goal:** Implement the core async generator inference loop that orchestrates provider calls, tool execution, error recovery, and event yielding.
**Files:** Create lib/engine/loop.ts, lib/engine/loop.test.ts, lib/engine/index.ts
**Depends on:** Provider Layer, Tool System

**Steps:**
1. Write test: loop yields [text, done] when provider returns text directly
2. Implement minimal loop that calls provider.chat() and yields text
3. Write test: loop yields [tool_call, tool_result, text, done] for single tool call then text
4. Implement tool call handling: yield tool_call event, execute tool, yield tool_result, append to context, loop back
5. Write test: loop handles multiple tool calls in sequence across iterations
6. Write test: loop yields error and done when max iterations exceeded
7. Implement max iterations counter with configurable limit (default: 10)
8. Write test: tool execution errors are fed back as context (agent-first error handling)
9. Implement error recovery: catch tool errors, create descriptive result string, append to context for LLM
10. Write test: provider errors yield error event and stop the loop
11. Write test: accumulated messages are correct after each iteration (provider receives full context)
12. Write test: messages array is not mutated (spread from config)
13. Integration test against real Ollama: send message, get text response
14. Integration test against real Ollama: trigger tool call, verify loop completes

**Tests:**
- [ ] Direct text response yields [text, done]
- [ ] Single tool call yields [tool_call, tool_result, text, done]
- [ ] Multi-turn tool calls work across iterations
- [ ] Max iterations limit stops the loop with error event
- [ ] Tool execution errors become context for next LLM call (not crashes)
- [ ] Provider errors yield error event and done
- [ ] Context accumulates correctly (provider sees all previous messages + tool results)
- [ ] Engine has zero Next.js imports
- [ ] Real Ollama integration: text response works
- [ ] Real Ollama integration: tool calling works

### Task: Database Layer - SQLite with Drizzle

**Goal:** Set up SQLite persistence with Drizzle ORM for conversations and messages, including query helpers for CRUD operations.
**Files:** Create lib/db/schema.ts, lib/db/index.ts, lib/db/queries.ts, lib/db/db.test.ts, drizzle.config.ts
**Depends on:** Project Scaffold and Core Types

**Steps:**
1. Write test: insert and retrieve a conversation (use in-memory SQLite)
2. Define Drizzle schema: conversations table (id, title, created_at, updated_at)
3. Write test: insert and retrieve messages for a conversation
4. Define messages table (id, conversation_id FK, role, content, tool_calls JSON text, tool_call_id, created_at)
5. Write test: tool_calls stored as JSON string and retrieved correctly
6. Implement getDb() singleton with lazy initialization and WAL mode
7. Implement query helpers: createConversation, listConversations, getConversationWithMessages, saveMessage, updateConversationTitle
8. Write tests for each query helper
9. Create drizzle.config.ts pointing to schema and SQLite file
10. Generate initial migration with drizzle-kit
11. Add looped.db, looped.db-wal, looped.db-shm to .gitignore

**Tests:**
- [ ] Conversation CRUD works (create, read, list, update title)
- [ ] Message CRUD works (create, read by conversation)
- [ ] Messages ordered by created_at
- [ ] tool_calls JSON serialization/deserialization works
- [ ] Foreign key constraint: messages reference valid conversation
- [ ] Conversations listed by most recent first

### Task: API Route and SSE Adapter

**Goal:** Build the SSE adapter converting the engine's async generator to a web stream, the chat API route, and conversation CRUD endpoints with message persistence.
**Files:** Create lib/engine/adapters.ts, lib/engine/adapters.test.ts, app/api/chat/route.ts, app/api/conversations/route.ts, app/api/conversations/[id]/route.ts, app/api/conversations/[id]/messages/route.ts
**Depends on:** Inference Loop Engine, Database Layer

**Steps:**
1. Write test: SSE adapter converts LoopEvents to `data: {json}\n\n` format
2. Write test: SSE adapter handles all event types (text, tool_call, tool_result, error, done)
3. Write test: SSE adapter handles generator errors gracefully (yields error event, closes stream)
4. Implement loopToSSEStream using ReadableStream with pull strategy
5. Implement cancel handler on stream to call generator.return() on client disconnect
6. Implement POST /api/chat route: parse request body (messages, model, conversationId), create provider + tools, run loop, stream SSE response
7. Wire message persistence: save user message before running loop, save assistant message (with tool calls) after loop completes
8. Implement GET /api/conversations: list all conversations (most recent first)
9. Implement POST /api/conversations: create new conversation
10. Implement GET /api/conversations/[id]: get conversation with all messages
11. Implement DELETE /api/conversations/[id]: delete conversation and its messages
12. Add request validation: require messages array, validate conversationId exists
13. Manual integration test: curl POST to /api/chat, verify SSE events stream correctly
14. Manual integration test: verify messages persist to SQLite after chat

**Tests:**
- [ ] SSE adapter outputs correct `data: {json}\n\n` format for each event type
- [ ] SSE adapter closes stream on generator completion
- [ ] SSE adapter handles generator errors with error event
- [ ] Client disconnect triggers generator cleanup
- [ ] POST /api/chat returns SSE stream with correct headers
- [ ] Conversation CRUD endpoints work (create, list, get, delete)
- [ ] Messages persist to SQLite after chat completion
- [ ] Request validation returns 400 for missing/invalid messages

### Task: Chat UI and Frontend Integration

**Goal:** Build the complete chat frontend with streaming message display, tool call visualization, conversation management, model selection, and polished styling using shadcn/ui and adapted AI Elements components.
**Files:** Create lib/hooks/use-chat-stream.ts, components/chat/message-thread.tsx, components/chat/message.tsx, components/chat/tool-call.tsx, components/chat/chat-input.tsx, components/chat/code-block.tsx, components/chat/conversation-sidebar.tsx, components/chat/model-selector.tsx. Modify app/page.tsx, app/layout.tsx
**Depends on:** API Route and SSE Adapter

**Steps:**
1. Initialize shadcn/ui: run init, add button, input, scroll-area, card, select, collapsible components
2. Install AI Elements: run npx ai-elements@latest, evaluate which components to keep
3. Evaluate AI Elements coupling to useChat(): if tightly coupled, adapt components to use our state; if too invasive, build from scratch with shadcn primitives
4. Implement useChatStream custom hook: manages message state, sends POST to /api/chat, consumes SSE stream via ReadableStream reader, handles buffered SSE parsing, updates state for each event type
5. Build ChatInput component: text input with send button, disabled during streaming, Enter to send
6. Build Message component: renders user vs assistant messages with different styling, handles markdown/code content
7. Build CodeBlock component: syntax-highlighted code display with copy button (basic pre/code for v1)
8. Build ToolCall component: collapsible panel showing tool name, arguments as formatted JSON, result with scrollable output
9. Build MessageThread component: scrollable container with auto-scroll to bottom on new messages
10. Build ConversationSidebar component: lists previous conversations, new conversation button, click to load
11. Build ModelSelector component: dropdown to pick Ollama model, stored in state, passed with chat requests
12. Wire everything together on app/page.tsx: sidebar + message thread + input layout
13. Add loading states: streaming indicator, initial load skeleton
14. Add empty states: no conversations, no messages
15. Add error display: connection errors, Ollama not running
16. Style for dark theme (fits local dev tool aesthetic)
17. Manual E2E test: full flow with real Ollama

**Tests:**
- [ ] User can type and send a message
- [ ] Streamed response appears progressively (not all at once)
- [ ] Tool calls display in real-time with expandable details (name, args, result)
- [ ] Code blocks render with syntax highlighting and copy button
- [ ] User can start a new conversation
- [ ] User can switch between previous conversations in sidebar
- [ ] Page refresh preserves conversation history (loaded from SQLite)
- [ ] Model selector allows choosing different Ollama models
- [ ] Loading/streaming states display correctly
- [ ] Error states display when Ollama is not running
- [ ] UI handles empty conversation state gracefully

## Sequence

1. **Task 1: Project Scaffold and Core Types** (no dependencies)
2. **Task 2: Provider Layer** (depends on Task 1)
3. **Task 3: Tool System** (depends on Task 1, can run parallel with Task 2)
4. **Task 4: Inference Loop Engine** (depends on Tasks 2 and 3) -- CRITICAL INTEGRATION GATE: test against real Ollama here
5. **Task 5: Database Layer** (depends on Task 1, can run parallel with Tasks 2-4)
6. **Task 6: API Route and SSE Adapter** (depends on Tasks 4 and 5)
7. **Task 7: Chat UI and Frontend Integration** (depends on Task 6)

```
Task 1 (Scaffold + Types)
  |
  +---> Task 2 (Provider) ----+
  |                            |
  +---> Task 3 (Tools) --------+--> Task 4 (Engine) --+
  |                                                    |
  +---> Task 5 (Database) -------------------------+   |
                                                   +---+--> Task 6 (API + SSE) --> Task 7 (UI)
```

**Optimal single-worker order:** 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

## Success Criteria

- [ ] User can send a message and receive a streamed response from Ollama
- [ ] Agent autonomously decides to use tools when appropriate (e.g., "list files" triggers bash)
- [ ] Tool calls and results are visible in the chat UI in real-time
- [ ] Agent handles tool errors by adapting its approach (feeds error back as context)
- [ ] Loop respects max iterations limit
- [ ] Conversations persist across page refreshes (SQLite)
- [ ] User can start new conversations and switch between previous ones
- [ ] User can select which Ollama model to use
- [ ] Engine runs independently of Next.js (can be imported and tested in isolation)
- [ ] Streaming works smoothly with no dropped events or UI glitches
