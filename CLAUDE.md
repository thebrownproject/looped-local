# bashling

A local-first AI agent framework with an inference loop, built in Next.js.

## Concept

Bashling is a general-purpose agent that runs a local inference loop against Ollama models.
The agent pulls context, decides whether to use a tool, runs the tool, feeds the result
back into context, and continues until it has a final response.

## Core Concepts

**Inference Loop**
- Takes context (messages + tools) and runs until the agent produces a text response
- Each iteration: call LLM, check for tool calls, execute tools, append results, repeat
- Max iterations safety limit to prevent runaway loops

**Provider Interface**
- Abstraction over LLM APIs so providers are swappable
- Normalizes responses into text or tool calls
- Start with Ollama, add OpenAI and Anthropic later

**Tool System**
- Built-in bash tool to start
- Users can define their own tools
- Tools auto-loaded from a tools folder

**Frontend**
- Simple Next.js chat UI
- Agent loop runs in an API route
- Stream results back to the frontend in real time

## Stack

- Next.js (App Router)
- TypeScript
- Ollama (local, default)
- Recommended models: qwen2.5-coder, llama3.1
