"use client";

import { useCallback, useState } from "react";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { ChatSession } from "@/components/chat/chat-session";
import { ErrorBoundary } from "@/components/chat/error-boundary";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default function ChatPage() {
  const [model] = useState("qwen2.5-coder");
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
    <SidebarProvider>
      <ConversationSidebar
        activeId={activeConvId}
        onSelect={handleSelectConversation}
        onNew={handleNew}
      />
      <SidebarInset>
        <div className="flex items-center px-4 py-2 shrink-0">
          <SidebarTrigger />
        </div>
        <ErrorBoundary>
          <ChatSession
            key={sessionKey}
            model={model}
            initialConvId={activeConvId}
            onConversationCreated={setActiveConvId}
          />
        </ErrorBoundary>
      </SidebarInset>
    </SidebarProvider>
  );
}
