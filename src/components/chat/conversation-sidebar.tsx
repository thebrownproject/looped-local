"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { PlusIcon, MessageSquareIcon, Trash2Icon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/chat/theme-toggle";
import { Button } from "@/components/ui/button";

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
}

interface Props {
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function ConversationSidebar({ activeId, onSelect, onNew }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/conversations", { signal });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setConversations(data);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }, []);

  // Fetches on mount and re-fetches when activeId changes.
  // AbortController prevents race conditions between overlapping fetches.
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- false positive: setState is behind await
    load(controller.signal);
    return () => controller.abort();
  }, [load, activeId]);

  const deleteConversation = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
        if (!res.ok) return;
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (id === activeId) onNew();
      } catch {
        // network error - leave state unchanged
      }
    },
    [activeId, onNew]
  );

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="flex-row items-center gap-2 p-4">
        <Image src="/icon.png" alt="Bashling logo" width={24} height={24} className="shrink-0" />
        <span className="font-semibold text-sm text-sidebar-foreground">Bashling</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNew}
          title="New conversation"
          className="ml-auto"
        >
          <PlusIcon className="size-4" />
        </Button>
      </SidebarHeader>

      <SidebarContent>
        {conversations.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted-foreground text-center">No conversations yet</p>
        ) : (
          <SidebarMenu>
            {conversations.map((conv) => (
              <SidebarMenuItem key={conv.id}>
                <SidebarMenuButton
                  isActive={activeId === conv.id}
                  onClick={() => onSelect(conv.id)}
                >
                  <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{conv.title}</span>
                </SidebarMenuButton>
                <SidebarMenuAction
                  showOnHover
                  onClick={(e) => deleteConversation(conv.id, e)}
                  title="Delete"
                >
                  <Trash2Icon className="size-3" />
                </SidebarMenuAction>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}
      </SidebarContent>

      <SidebarFooter className="flex-row items-center justify-end p-2">
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  );
}
