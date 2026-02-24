# Feature: Streaming + Reasoning Display & UI Polish

**Goal:** Stream tokens in real-time with think-tag parsing for qwen3:8b reasoning, and replace the prototype UI with a polished Codex-inspired layout using shadcn sidebar-08, Geist font, and dark/light theme toggle.

## Overview

Two workstreams executed sequentially: UI polish first (quick visible wins, avoids merge conflicts in chat-session.tsx), then streaming (the heavier backend work runs as one uninterrupted sequence).

The streaming pipeline changes from one-shot responses to generators all the way down: OllamaProvider yields tokens -> inference loop forwards events -> SSE adapter encodes frames -> frontend hook accumulates state -> Reasoning UI renders thinking content.

## Tasks

### Task: Install dependencies and configure Geist font and theme system

**Goal:** Install shadcn sidebar, next-themes, configure Geist fonts, and wrap app in ThemeProvider
**Files:** Modify layout.tsx; install shadcn sidebar component + next-themes
**Depends on:** None

**Steps:**
1. Run `npx shadcn@latest add sidebar -y` to install sidebar + dependencies
2. Run `npm install next-themes`
3. Update layout.tsx: import Geist/Geist_Mono from next/font/google, wrap children in ThemeProvider (attribute="class", defaultTheme="dark"), remove hard-coded className="dark" from html, add suppressHydrationWarning, apply font variables + font-sans antialiased to body
4. Verify build and all 126 tests pass

**Tests:**
- [ ] next build completes without errors
- [ ] Geist font variables applied to body
- [ ] ThemeProvider wraps the app
- [ ] No hard-coded dark class on html
- [ ] All existing tests pass

### Task: Restructure layout with shadcn sidebar and rebuild conversation sidebar

**Goal:** Replace page layout with SidebarProvider/Sidebar(inset)/SidebarInset, rebuild sidebar with logo, conversations, and theme toggle
**Files:** Modify page.tsx, conversation-sidebar.tsx; create public/icon.png, public/favicon.ico
**Depends on:** Install dependencies and configure Geist font and theme system

**Steps:**
1. Copy assets/icon.png to public/icon.png; generate favicon via sips
2. Rebuild conversation-sidebar.tsx using Sidebar(variant="inset"), SidebarHeader (logo + "Looped" in top-left), SidebarContent (SidebarMenu with conversation items using SidebarMenuButton/SidebarMenuAction), SidebarFooter (ThemeToggle using useTheme)
3. Update page.tsx: wrap in SidebarProvider, use ConversationSidebar + SidebarInset, add SidebarTrigger in a minimal header (temporarily keep ModelSelector in header until next task)
4. Remove all horizontal line borders/dividers: no border-b on header, no border-t on input area, no separators between sections. Clean, borderless design throughout.
5. Verify build and all tests pass

**Tests:**
- [ ] Sidebar renders with logo in top-left and "Looped" text
- [ ] Conversation list uses shadcn menu components
- [ ] Sidebar collapse/expand works via SidebarTrigger
- [ ] Chat area enclosed in SidebarInset (rounded container)
- [ ] Theme toggle in sidebar footer switches themes
- [ ] New conversation and delete conversation still work
- [ ] No horizontal line dividers/borders visible in chat area

### Task: Move model selector into input bar and remove header

**Goal:** Move ModelSelector from header into PromptInput bar, remove header bar from chat area
**Files:** Modify page.tsx, chat-session.tsx, model-selector.tsx
**Depends on:** Restructure layout with shadcn sidebar and rebuild conversation sidebar

**Steps:**
1. Update page.tsx: remove ModelSelector and "Looped Agent" text from header, pass model + onModelChange props to ChatSession, keep only SidebarTrigger in minimal top bar
2. Update chat-session.tsx: accept model/onModelChange props, render ModelSelector inside PromptInputFooter (left of submit button)
3. Adjust model-selector.tsx trigger styling for inline placement (compact, borderless, text-xs)
4. Redesign empty state: move "What can I help you with?" down near the chat bar (bottom-aligned with flex justify-end or mt-auto), make the heading font significantly larger (text-3xl or text-4xl), keep suggestion chips below it
5. Remove any remaining horizontal borders/dividers (border-t on input container, etc.)
6. Verify build and all tests pass

**Tests:**
- [ ] No header bar with "Looped Agent" text in chat area
- [ ] ModelSelector renders inside PromptInput footer
- [ ] Model selection still works and affects subsequent messages
- [ ] Empty state heading is large and positioned near the bottom/input area
- [ ] No horizontal line dividers anywhere in the chat area
- [ ] All existing tests pass

### Task: Define provider event types and extend LoopEvent and ChatMessage

**Goal:** Add ProviderEvent union type, change Provider.chat() to AsyncGenerator, extend LoopEvent with thinking/text_delta, add reasoning fields to ChatMessage
**Files:** Modify providers/types.ts, engine/types.ts, hooks/use-agent-chat.ts (interface only)
**Depends on:** None

**Steps:**
1. Add ProviderEvent type to providers/types.ts: thinking, text_delta, tool_calls variants
2. Change Provider.chat() return type from Promise<LLMResponse> to AsyncGenerator<ProviderEvent>
3. Extend LoopEvent union in engine/types.ts with thinking and text_delta variants (keep existing text variant)
4. Add reasoning?: string and thinkingDuration?: number to ChatMessage interface
5. Verify TypeScript compiles (expect downstream type errors in ollama.ts and loop.ts until Tasks 2-3)

**Tests:**
- [ ] TypeScript compiles with new types (tsc --noEmit shows only expected downstream errors)
- [ ] ProviderEvent has thinking, text_delta, and tool_calls variants
- [ ] LoopEvent includes thinking and text_delta
- [ ] ChatMessage includes optional reasoning and thinkingDuration

### Task: Rewrite OllamaProvider for streaming with think-tag state machine

**Goal:** Switch chat() to stream:true, parse NDJSON, implement think-tag state machine that separates thinking from response content
**Files:** Modify providers/ollama.ts, providers/ollama.test.ts
**Depends on:** Define provider event types and extend LoopEvent and ChatMessage

**Steps:**
1. Write new test mocks: ndjsonStream() helper to build mock ReadableStream of NDJSON lines, collect() helper to gather all events from AsyncGenerator
2. Refactor all 11 existing tests to use new mock pattern (mockStreamFetch returns ReadableStream, collect() gathers events)
3. Add new tests: think-tag parsing, tag split across chunks, no-think-tags passthrough, content before think tags
4. Implement streaming chat(): fetch with stream:true, parseNDJSON async generator reads body chunks and yields OllamaStreamChunk objects
5. Implement think-tag state machine with 4 states (outside, maybe_open, inside, maybe_close), processes char-by-char per chunk, batches consecutive same-type events before yielding
6. Verify all ollama tests pass

**Tests:**
- [ ] Streams text content as text_delta events (no think tags)
- [ ] Parses think tags and yields thinking events
- [ ] Content after closing think tag yields as text_delta
- [ ] Handles think tag split across NDJSON chunks
- [ ] Handles close think tag split across chunks
- [ ] Content before think tags yields as text_delta
- [ ] Tool call response yields tool_calls event
- [ ] Non-200 response throws
- [ ] Network error throws
- [ ] All 11 original test scenarios pass with new mocks

### Task: Update inference loop for streaming and refactor loop and adapter tests

**Goal:** Update runLoop to for-await over provider's AsyncGenerator, forward streaming events, update API route for text_delta accumulation, refactor all loop and adapter tests
**Files:** Modify engine/loop.ts, app/api/chat/route.ts, engine/loop.test.ts, engine/adapters.test.ts
**Depends on:** Rewrite OllamaProvider for streaming with think-tag state machine

**Steps:**
1. Build makeStreamingProvider() test helper that yields ProviderEvent[] sequences on successive calls
2. Refactor ~20 loop tests: change makeProvider to makeStreamingProvider, update expectations from text to text_delta events
3. Add new tests: forwards thinking events, forwards text_delta events, handles tool cycle with streaming follow-up
4. Implement streaming runLoop: for-await over provider.chat(), forward thinking/text_delta as LoopEvents, handle tool_calls event with existing tool execution cycle, yield done after completion
5. Update API route tracked(): accumulate from text_delta (and text for backward compat) into assistantContent for DB persistence
6. Add adapter tests for thinking and text_delta SSE frame encoding
7. Verify ALL tests pass (target: ~140+ tests)

**Tests:**
- [ ] runLoop forwards text_delta events from provider
- [ ] runLoop forwards thinking events from provider
- [ ] runLoop handles tool_calls -> execute -> continue loop
- [ ] runLoop yields done after streaming completes
- [ ] runLoop yields error + done on provider error
- [ ] runLoop respects maxIterations
- [ ] API route accumulates text_delta for DB save
- [ ] Adapter encodes thinking and text_delta as SSE frames
- [ ] All ~140 tests pass (no regressions)

### Task: Add streaming and reasoning state to useAgentChat hook

**Goal:** Handle text_delta and thinking SSE events in the frontend hook, accumulate reasoning, track thinkingDuration
**Files:** Modify hooks/use-agent-chat.ts, hooks/use-agent-chat.test.ts
**Depends on:** Update inference loop for streaming and refactor loop and adapter tests

**Steps:**
1. Write failing tests: text_delta accumulates into content, thinking accumulates into reasoning, thinkingDuration calculated, text handler still works
2. Add text_delta and thinking to VALID_EVENT_TYPES set
3. Add thinkingStartRef for timer tracking
4. Implement text_delta handler: append to content, stop thinking timer on first text_delta (calculate duration)
5. Implement thinking handler: start timer on first thinking event, append to reasoning field
6. Keep existing text handler for backward compatibility
7. Verify all hook tests pass, then full suite

**Tests:**
- [ ] text_delta events accumulate into assistant message content
- [ ] thinking events accumulate into reasoning field
- [ ] thinkingDuration calculated from first thinking to first text_delta
- [ ] Mixed thinking then text_delta produces correct state
- [ ] text events still work (backward compatibility)

### Task: Build Reasoning UI component and integrate into ChatSession

**Goal:** Build collapsible Reasoning compound component that auto-opens during thinking, auto-closes when response starts, shows timer when collapsed
**Files:** Create components/ai-elements/reasoning.tsx; modify components/chat/chat-session.tsx
**Depends on:** Add streaming and reasoning state to useAgentChat hook

**Steps:**
1. Create Reasoning compound component following AI Elements pattern: Reasoning (root with Context/Collapsible), ReasoningTrigger (brain icon + label + chevron), ReasoningContent (reasoning text via Streamdown/MessageResponse)
2. Implement auto-open/close via useEffect: open when isThinking true, close when isThinking becomes false
3. Trigger shows "Thinking..." (with pulse animation) when active, "Thought for N seconds" when complete
4. Integrate into AssistantMessage in chat-session.tsx: derive isThinking from status + reasoning + content, render Reasoning above tool parts and response text
5. Update Shimmer fallback to also check !msg.reasoning
6. Verify build and all tests pass

**Tests:**
- [ ] Reasoning component renders collapsed with "Thought for N seconds"
- [ ] Component not rendered when reasoning is undefined/empty
- [ ] Shows "Thinking..." with pulse when isThinking is true
- [ ] Reasoning panel appears above response text in assistant messages
- [ ] next build succeeds
- [ ] All tests pass

## Sequence

1. Install dependencies and configure Geist font and theme system (S, no dependencies)
2. Restructure layout with shadcn sidebar and rebuild conversation sidebar (M, depends on 1)
3. Move model selector into input bar and remove header (S, depends on 2)
4. Define provider event types and extend LoopEvent and ChatMessage (S, no dependencies, can parallel with 1-3)
5. Rewrite OllamaProvider for streaming with think-tag state machine (L, depends on 4)
6. Update inference loop for streaming and refactor loop and adapter tests (L, depends on 5)
7. Add streaming and reasoning state to useAgentChat hook (M, depends on 6)
8. Build Reasoning UI component and integrate into ChatSession (M, depends on 7)

**Parallel execution:** Tasks 1-3 (WS2) and Task 4 (WS1 start) can run in parallel. WS2 completes well before WS1.

**Critical path:** Task 4 -> 5 -> 6 -> 7 -> 8 (streaming pipeline is the bottleneck)

## Success Criteria

- [ ] Tokens stream to the UI character-by-character as generated
- [ ] qwen3:8b thinking content appears in collapsible Reasoning panel with timer
- [ ] Reasoning panel auto-opens during thinking, auto-collapses when response starts
- [ ] Chat area enclosed in rounded SidebarInset container
- [ ] No header bar in chat area; model selector in input bar
- [ ] Sidebar shows logo, conversations, theme toggle, collapses/expands
- [ ] Dark/light mode toggle works and persists
- [ ] Geist font renders throughout
- [ ] All tests pass (~145 target)
- [ ] App works end-to-end with qwen3:8b on Ollama
