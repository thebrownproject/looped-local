"use client";

import { useCallback, useEffect } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Terminal } from "@/components/ai-elements/terminal";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { useAgentChat, type ChatMessage, type ToolPart } from "@/lib/hooks/use-agent-chat";

const SUGGESTIONS = [
  "What files are in this directory?",
  "Write a hello world in Python",
  "Show me the current date and time",
  "List all running processes",
];

function ToolCallCard({ part }: { part: ToolPart }) {
  return (
    <Tool>
      <ToolHeader type="dynamic-tool" state={part.state} toolName={part.toolName} />
      <ToolContent>
        <ToolInput input={part.input} />
        {part.state === "output-available" && part.toolName === "bash" ? (
          <Terminal output={String(part.output ?? "")} isStreaming={false} />
        ) : (
          <ToolOutput output={part.output} errorText={part.errorText} />
        )}
      </ToolContent>
    </Tool>
  );
}

function AssistantMessage({ msg, isStreaming }: { msg: ChatMessage; isStreaming: boolean }) {
  return (
    <Message from="assistant">
      <MessageContent>
        {msg.toolParts?.map((part) => (
          <ToolCallCard key={part.toolCallId} part={part} />
        ))}
        {msg.content && <MessageResponse>{msg.content}</MessageResponse>}
        {isStreaming && !msg.content && !msg.toolParts?.length && (
          <Shimmer className="text-xs">Thinking...</Shimmer>
        )}
      </MessageContent>
    </Message>
  );
}

interface Props {
  model: string;
  initialConvId?: string;
  onConversationCreated?: (id: string) => void;
}

export function ChatSession({ model, initialConvId, onConversationCreated }: Props) {
  const { messages, status, sendMessage, conversationId } = useAgentChat(initialConvId);

  // Notify parent when hook creates a new conversation
  useEffect(() => {
    if (conversationId && conversationId !== initialConvId) {
      onConversationCreated?.(conversationId);
    }
  }, [conversationId, initialConvId, onConversationCreated]);

  const handleSubmit = useCallback(
    ({ text }: { text: string }) => {
      const trimmed = text.trim();
      if (!trimmed || status === "submitted" || status === "streaming") return;
      sendMessage(trimmed, model);
    },
    [sendMessage, status, model]
  );

  const isStreaming = status === "submitted" || status === "streaming";

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState>
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-medium text-sm">What can I help you with?</h3>
                  <p className="text-muted-foreground text-sm">
                    Ask me anything - I can run bash commands, read files, and more.
                  </p>
                </div>
                <Suggestions>
                  {SUGGESTIONS.map((s) => (
                    <Suggestion
                      key={s}
                      suggestion={s}
                      onClick={(text) => handleSubmit({ text })}
                    />
                  ))}
                </Suggestions>
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((msg, i) => {
              if (msg.role === "user") {
                return (
                  <Message key={msg.id} from="user">
                    <MessageContent>
                      <span>{msg.content}</span>
                    </MessageContent>
                  </Message>
                );
              }
              const isLastAssistant = !messages.slice(i + 1).some((m) => m.role === "assistant");
              return (
                <AssistantMessage
                  key={msg.id}
                  msg={msg}
                  isStreaming={isStreaming && isLastAssistant}
                />
              );
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {status === "error" && (
        <div role="alert" className="shrink-0 border-t border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          Something went wrong. Check that Ollama is running and try again.
        </div>
      )}

      <div className="shrink-0 p-4">
        <PromptInput onSubmit={(msg) => handleSubmit({ text: msg.text })}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask anything..." disabled={isStreaming} />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputSubmit status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
