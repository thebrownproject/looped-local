"use client";

import { useCallback, useState } from "react";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { ModelSelector } from "@/components/chat/model-selector";
import { ChatSession } from "@/components/chat/chat-session";

export default function ChatPage() {
  const [model, setModel] = useState("qwen2.5-coder");
  // sessionKey remounts ChatSession to reset hook state on new conversation
  const [sessionKey, setSessionKey] = useState(0);
  const [activeConvId, setActiveConvId] = useState<string | undefined>(undefined);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConvId(id);
    setSessionKey((k) => k + 1);
  }, []);

  const handleNew = useCallback(() => {
    setActiveConvId(undefined);
    setSessionKey((k) => k + 1);
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground dark">
      <ConversationSidebar
        activeId={activeConvId}
        onSelect={handleSelectConversation}
        onNew={handleNew}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b px-4 py-2 shrink-0">
          <span className="text-sm text-muted-foreground">Looped Agent</span>
          <ModelSelector value={model} onChange={setModel} />
        </header>

        <ChatSession
          key={sessionKey}
          model={model}
          initialConvId={activeConvId}
          onConversationCreated={setActiveConvId}
        />
      </main>
    </div>
  );
}
