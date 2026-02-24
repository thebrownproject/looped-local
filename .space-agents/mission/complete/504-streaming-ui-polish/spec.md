# Exploration: Streaming + Reasoning Display & UI Polish

**Date:** 2026-02-24
**Status:** Ready for planning (all questions resolved)

## Problem

Looped's Phase 1 is functionally complete but has two major UX gaps:

1. **No streaming.** The Ollama provider uses `stream: false`, so the entire response (including thinking content) arrives at once. Users see nothing while the model thinks, then a wall of text appears. For qwen3:8b which has native `<think>` tag reasoning, the thinking text renders as literal text mixed into the response instead of being displayed in a collapsible reasoning component.

2. **Rough UI.** The interface lacks visual polish compared to modern AI chat UIs (e.g., OpenAI Codex). Specific issues: no font configured (browser defaults), hard-coded dark mode with no toggle, plain text sidebar with no logo, no rounded chat container, model selector in the wrong place (top-right instead of input bar), and the prompt input only uses ~5% of its built-in capabilities.

These gaps make the app feel like a prototype rather than a portfolio-quality project.

## Solution

Two workstreams that share the same frontend surface:

**Workstream 1: Token Streaming + Reasoning Display**
Switch the entire pipeline to stream tokens in real-time. Parse qwen3:8b's `<think>` tags at the provider level and route thinking content into a dedicated Reasoning UI component (AI Elements style) that auto-opens during thinking, shows the reasoning text streaming in, then collapses to "Thought for X seconds" when the response begins.

**Workstream 2: UI Polish (Codex-inspired)**
Replace the current layout with shadcn's sidebar-08 (inset variant) to get the rounded container effect, collapsible sidebar, and proper component structure. Move the model selector into the input bar, add Geist font, implement dark/light mode toggle, incorporate the project logo, and clean up the overall visual design.

## Requirements

### Streaming + Reasoning
- [ ] OllamaProvider streams tokens using Ollama's `stream: true` API
- [ ] Provider interface changes from `Promise<LLMResponse>` to `AsyncGenerator` yielding typed token events
- [ ] Provider parses `<think>...</think>` tags via state machine, yielding `{ type: "thinking" }` and `{ type: "text_delta" }` events
- [ ] LoopEvent types extended with `thinking` and `text_delta` variants
- [ ] Inference loop forwards provider stream events through to SSE
- [ ] Frontend hook accumulates `text_delta` into message content and `thinking` into a separate reasoning field
- [ ] Reasoning component displays thinking content in a collapsible panel
- [ ] Reasoning panel auto-opens during thinking, auto-collapses when response starts
- [ ] Reasoning panel shows "Thought for X seconds" when collapsed
- [ ] Reasoning panel is expandable to review full thinking text after response

### UI Polish
- [ ] Replace current sidebar with shadcn sidebar-08 (inset variant)
- [ ] Sidebar header shows project logo + "Looped" name
- [ ] Conversation list uses shadcn sidebar menu components
- [ ] New conversation button in sidebar
- [ ] Sidebar is collapsible via SidebarTrigger
- [ ] Remove the "Looped Agent" header bar from chat area entirely
- [ ] Chat area wrapped in SidebarInset (rounded container)
- [ ] Model selector moved into the prompt input bar (Codex-style)
- [ ] Geist font configured in layout.tsx via next/font
- [ ] Dark/light mode toggle in sidebar footer
- [ ] Light mode uses existing CSS variables already defined in globals.css
- [ ] Logo appears in sidebar header and optionally in empty state

## Non-Requirements

- Not adding OpenAI or Anthropic providers in this iteration
- Not implementing conversation search or filtering
- Not adding user authentication or accounts
- Not building the full Codex bottom status bar (Local, Full access, branch info)
- Not implementing message branching (infrastructure exists but out of scope)
- Not adding file attachments to prompt input
- Not building mobile-responsive layout (desktop-first for now)
- Not persisting theme preference to database (localStorage is fine)

## Architecture

### Streaming Pipeline (generators all the way down)

```
OllamaProvider.chat()        AsyncGenerator<ProviderEvent>
  yields { type: "thinking", content: "..." }
  yields { type: "text_delta", content: "..." }
  yields { type: "tool_calls", calls: [...] }
        |
        v
runLoop()                    AsyncGenerator<LoopEvent>
  forwards thinking/text_delta events
  handles tool_call/tool_result cycle
  yields all event types
        |
        v
loopToSSEStream()            ReadableStream<Uint8Array>
  encodes each LoopEvent as SSE frame
  (no changes needed, passes through new types)
        |
        v
useAgentChat hook            React state
  parseSSE() reads frames
  thinking events -> reasoning field + timer
  text_delta events -> content field (append)
  done event -> finalize reasoning duration
        |
        v
ChatSession UI               React components
  <Reasoning> component for thinking
  <MessageResponse> for streamed text
```

### Provider Event Types (new)

```typescript
export type ProviderEvent =
  | { type: "thinking"; content: string }
  | { type: "text_delta"; content: string }
  | { type: "tool_calls"; calls: ToolCall[] };
```

### Think Tag State Machine (in OllamaProvider)

States: `outside` | `maybe_open` | `inside` | `maybe_close`

- Buffers partial tag characters (e.g., `<thi` across chunks)
- When `<think>` fully detected: switch to `inside`, emit buffered content as `thinking`
- When `</think>` fully detected: switch to `outside`, emit subsequent content as `text_delta`
- If buffer doesn't match tag: flush buffer as current type and reset

### LoopEvent Extensions

```typescript
// Add to existing union:
| { type: "thinking"; content: string }
| { type: "text_delta"; content: string }
```

The existing `{ type: "text" }` event is kept for backward compatibility (used after tool call cycles where the full text is available).

### ChatMessage Extensions

```typescript
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolParts?: ToolPart[];
  reasoning?: string;        // NEW: accumulated thinking text
  thinkingDuration?: number; // NEW: seconds spent thinking
}
```

### UI Layout (sidebar-08 based)

```
SidebarProvider
  |-- Sidebar (variant="inset")
  |     |-- SidebarHeader: Logo + "Looped"
  |     |-- SidebarContent: Conversation list (SidebarMenu)
  |     |-- SidebarFooter: Theme toggle + settings
  |
  |-- SidebarInset (rounded container)
        |-- Chat messages area (scrollable)
        |     |-- Reasoning component (per assistant message)
        |     |-- MessageResponse (streamed markdown)
        |     |-- ToolCallCards
        |
        |-- Prompt input bar (sticky bottom)
              |-- Model selector dropdown (left)
              |-- Textarea (center)
              |-- Submit button (right)
```

### Theme System

- Use `next-themes` ThemeProvider wrapping the app
- Toggle component in sidebar footer (sun/moon icon button)
- Existing light/dark CSS variables in globals.css are already defined
- Persist preference to localStorage via next-themes default behavior

## Constraints

- Must preserve the custom inference loop architecture (not replace with Vercel AI SDK's streamText)
- Must maintain all 126 existing tests passing (30+ in loop.test.ts depend on Provider interface)
- Ollama streaming response format: NDJSON lines with `{ message: { content: "..." }, done: false }`
- The `<think>` tag parsing is qwen3-specific; other models may not produce thinking content
- AI Elements components use compound component pattern with Context providers; new components should follow same pattern
- shadcn sidebar-08 requires installing sidebar, breadcrumb, avatar, and separator components as dependencies
- Geist font is available via `next/font/google` (Geist Sans + Geist Mono)
- The Streamdown markdown renderer already handles incremental text, so text_delta streaming should render smoothly

## Success Criteria

- [ ] Tokens stream to the UI as they are generated (visible character-by-character appearance)
- [ ] qwen3:8b thinking content appears in a collapsible Reasoning panel, not in the main response
- [ ] Reasoning panel shows "Thought for N seconds" when collapsed, full text when expanded
- [ ] Reasoning panel auto-opens during thinking phase, auto-collapses when response text begins
- [ ] Chat area is enclosed in a rounded container (SidebarInset)
- [ ] No header bar in chat area; model selector is in the input bar
- [ ] Sidebar shows logo, conversation list, and theme toggle
- [ ] Sidebar collapses/expands via trigger button
- [ ] Dark/light mode toggle works and persists preference
- [ ] Geist font renders throughout the app
- [ ] All existing tests pass
- [ ] App works end-to-end with qwen3:8b on Ollama

## Open Questions

None. All questions resolved.

## Resolved

- **Logo**: `assets/icon.png` - Purple infinity symbol (1024x1024 PNG). Copy to `public/` for use. Purple (#8B5CF6 approximate) provides a natural brand accent color. Will need a smaller version for sidebar (32x32) and favicon.
- **Input bar**: Keep it simple. Model selector dropdown + textarea + submit button. No extras.
- **Test strategy**: Refactor existing tests to use AsyncGenerator mocks. One consistent test style.

## Next Steps

1. `/plan` to create implementation tasks from this spec
2. Install shadcn sidebar-08 and required dependencies
3. Decide on test strategy before implementation begins
