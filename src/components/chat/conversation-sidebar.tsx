"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlusIcon, MessageSquareIcon, Trash2Icon } from "lucide-react";

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

  // Single effect: fetches on mount and re-fetches when activeId changes
  // AbortController prevents race conditions between overlapping fetches
  useEffect(() => {
    const controller = new AbortController();
    // setState in load() only fires after async fetch, not synchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect -- false positive: setState is behind await
    load(controller.signal);
    return () => controller.abort();
  }, [load, activeId]);

  const deleteConversation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === activeId) onNew();
    } catch {
      // network error - leave state unchanged
    }
  }, [activeId, onNew]);

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-sidebar">
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="font-semibold text-sm text-sidebar-foreground">Looped</h1>
        <Button variant="ghost" size="icon" onClick={onNew} title="New conversation">
          <PlusIcon className="size-4" />
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground text-center">No conversations yet</p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(conv.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(conv.id);
                }
              }}
              className={cn(
                "group flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent cursor-pointer",
                activeId === conv.id && "bg-sidebar-accent text-sidebar-accent-foreground"
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sidebar-foreground">{conv.title}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => deleteConversation(conv.id, e)}
                title="Delete"
              >
                <Trash2Icon className="size-3" />
              </Button>
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}
