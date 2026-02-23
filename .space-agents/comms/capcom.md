# CAPCOM Master Log

*Append-only. Grep-only. Never read fully.*

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
