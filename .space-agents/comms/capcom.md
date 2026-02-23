# CAPCOM Master Log

*Append-only. Grep-only. Never read fully.*

---

## [2026-02-24 10:30] Session 3

**Branch:** main | **Git:** uncommitted (new beads + exploration files)

### What Happened

Full brainstorm and planning session for Phase 2 enhancements. No code written, all exploration and planning.

**Brainstorm explored two workstreams:**
1. **Token streaming + reasoning display** - Current OllamaProvider uses `stream: false` (found in ollama.ts:49). All content arrives at once. qwen3:8b's `<think>` tags render as literal text. Need: switch to `stream: true`, add think-tag state machine in provider, yield `thinking` and `text_delta` events through generators-all-the-way-down pipeline, build AI Elements Reasoning component with auto-open/close and "Thought for N seconds" timer.

2. **UI polish (Codex-inspired)** - No font configured (browser defaults!), hard-coded dark mode, plain sidebar, model selector in wrong place, no logo. Need: shadcn sidebar-08 (inset variant) for rounded chat container, Geist font, next-themes for dark/light toggle, model selector in input bar, logo from assets/icon.png (purple infinity symbol).

**Research agents deployed:**
- Streaming architecture agent: mapped full pipeline (provider -> loop -> SSE adapter -> hook -> UI), confirmed `stream: false`, no think parsing, `Streamdown` already handles incremental text
- UI state agent: catalogued all components, found PromptInput is 1344 lines but only 5% used, MessageActions built but unwired, 16 shadcn components installed

**Planning council convened (3 sequential agents):**
- Task planner: broke into 8 tasks across 2 workstreams
- Sequencer: recommended WS2 first (6->7->8->1->2->3->4->5), WS2 avoids chat-session.tsx merge conflict
- Implementer: provided detailed TDD steps with code for all 8 tasks

**Beads created:**
- looped-504 (feature): Streaming + Reasoning Display & UI Polish
- 8 tasks: 504.1 through 504.8 with full dependency chain
- WS2: 504.1 -> 504.2 -> 504.3 (UI polish)
- WS1: 504.4 -> 504.5 -> 504.6 -> 504.7 -> 504.8 (streaming)

### Decisions Made
- Provider interface: AsyncGenerator (not callback or dual-mode)
- Think-tag parsing: in provider layer (not loop or middleware), each provider handles its own model quirks
- Reasoning UX: timer + collapsible (auto-open during thinking, collapse to "Thought for N seconds")
- Sequencing: WS2 first for quick wins, then WS1 uninterrupted
- Font: Geist (via next/font/google)
- Theme: next-themes with sidebar footer toggle
- Input bar: simple (model selector + textarea + submit, no extras)
- Tests: refactor existing mocks to AsyncGenerator (not dual test suites)
- Borders: no horizontal line dividers/separators, but container/box borders are fine

### Gotchas
- No font configured at all in layout.tsx (browser defaults). Biggest quick-win visual fix.
- PromptInput component has 1344 lines of built-in capability (attachments, command palette, file dialogs) but chat only uses ~5% of it
- MessageActions and MessageBranch systems are fully built but not wired up
- Light mode CSS variables already exist in globals.css, just need toggle mechanism
- Legacy beads database needed `bd migrate --update-repo-id` at session start

### Next Action
- Run `/mission` to start executing. Two tasks ready: 504.1 (install deps/font/theme) and 504.4 (provider types). Can run in parallel.

---

## [2026-02-23] System Initialized

Space-Agents installed. HOUSTON standing by.

---

## [2026-02-23 21:45] Session 1

**Branch:** (no git repo) | **Git:** not initialized

### What Happened
Full exploration and planning session for the Looped agent framework. Started from scratch with no code.

**Brainstorm phase:** Explored architecture decisions through interactive Q&A:
- Confirmed dual purpose: portfolio piece AND genuinely useful local agent
- Core differentiator: autonomous inference loop (LLM decides, acts, observes, repeats)
- Engine design: standalone async generator module in lib/engine/ (no Next.js dependency, portable for future Electron)
- Provider layer: simple Provider interface, OllamaProvider first
- Streaming: SSE for web, engine is transport-agnostic
- Tools: bash + file read/write built-in, self-extending tools deferred to phase 2
- Frontend: shadcn/ui + adapted AI Elements (strip useChat() dependency, wire to custom streaming)
- Persistence: SQLite via Drizzle ORM for conversation history
- Error handling: agent-first (errors fed back as context for LLM to adapt)

**Spec created:** .space-agents/exploration/ideas/2026-02-23-looped-agent-framework/spec.md

**Planning phase:** Convened council (task planner, sequencer, implementer). All three agreed on 7-task breakdown:
1. Project Scaffold + Core Types
2. Provider Layer (OllamaProvider)
3. Tool System (Registry + Built-in Tools)
4. Inference Loop Engine
5. Database Layer (SQLite + Drizzle)
6. API Route + SSE Adapter
7. Chat UI + Frontend Integration

**Beads created:** Feature looped-bra with 7 tasks, all dependencies wired. Plan at .space-agents/mission/staged/bra-looped-agent-framework/plan.md

### Decisions Made
- Build own engine from scratch (not using Vercel AI SDK's streamText/maxSteps) -- the loop IS the project
- Standalone engine module for Electron portability (just a file separation, not a separate process)
- SSE over WebSockets (simpler, maps naturally to server-push pattern)
- Drizzle ORM over Prisma or raw SQL (lightweight, type-safe, good Next.js ecosystem fit)
- Tool execute functions return strings (never throw) so errors can be fed to the LLM
- AI Elements installed as source code (shadcn-style) and adapted, with pure shadcn fallback if too coupled

### Gotchas
- AI Elements is tightly coupled to useChat() hook -- may need to fall back to pure shadcn/ui if adaptation is too invasive
- Ollama tool calling format varies by model -- need to test early in Task 2
- Ollama doesn't return tool call IDs -- we generate our own
- Types need to flow one direction (engine/types.ts is root) to avoid circular imports

### Next Action
Run `/mission solo` or `/mission orchestrated` to start with Task looped-bra.1 (Project Scaffold and Core Types).

---

## [2026-02-24 09:55] Session 2

**Branch:** main | **Git:** committed + pushed to github.com/thebrownproject/looped

### What Happened

Full build + debug + fix session. Went from zero code to complete Phase 1 in one session.

**Orchestrated mission execution (7 tasks):**
All 7 tasks executed with Pathfinder/Builder/Inspector cycle per task:
1. looped-bra.1: Project Scaffold + Core Types (already built from prior session, inspector verified 4/4)
2. looped-bra.2: OllamaProvider (7/7, tool format wrapping, arg normalisation, resolveToolName)
3. looped-bra.3: Tool System (9/9, registry + bash/read_file/write_file with DI factory pattern)
4. looped-bra.4: Inference Loop (10/10, async generator with executeToolSafe, max iterations)
5. looped-bra.5: Database Layer (6/6, Drizzle + SQLite WAL + conversations/messages schema)
6. looped-bra.6: API Route + SSE Adapter (2 blockers found and fixed inline)
7. looped-bra.7: Chat UI (2 warnings fixed: history loading, stale import)

**AI Elements research** via Context7 + elements.ai-sdk.dev. Components: conversation, message, prompt-input, tool, terminal, shimmer, suggestion. Custom useAgentChat hook replaces useChat.

**Debug sweep (10 parallel agents):** Found ~93 unique issues (67 bugs + 26 test gaps).
**Fix sweep (10 parallel agents):** Fixed 76 bugs, added 36 tests. Suite: 90 -> 126 tests.

Key fixes: conversationId returned via new LoopEvent, AbortController on all fetches, race condition guard, tool messages persisted, transaction on delete, generator cleanup, timeout clamping, SSE buffer flush, ErrorBoundary, ARIA, ESLint clean.

**GitHub repo created:** github.com/thebrownproject/looped

### Decisions Made
- Orchestrated mode for 7 tasks
- AI Elements as source + custom useAgentChat hook
- New "conversation" LoopEvent variant for convId
- ON DELETE CASCADE via migration 0001
- globalThis singleton for DB HMR safety

### Gotchas
- drizzle-kit push must run after schema changes or app 500s
- qwen3:8b tool calling reliability needs testing
- AI Elements prompt-input.tsx and tool.tsx still import from ai package

### Next Action
- Test app end-to-end with Ollama
- Debug any remaining runtime issues
- Consider Phase 2: self-extending tools, conversation search

---
