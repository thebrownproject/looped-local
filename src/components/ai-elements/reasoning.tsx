"use client";

import type { ComponentProps } from "react";
import { useEffect, useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { BrainIcon, ChevronDownIcon } from "lucide-react";

import { MessageResponse } from "./message";

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isThinking: boolean;
  thinkingDuration?: number;
};

export const Reasoning = ({
  className,
  isThinking,
  thinkingDuration,
  ...props
}: ReasoningProps) => {
  const [open, setOpen] = useState(isThinking);

  // Auto-open when thinking starts, auto-close when thinking ends
  useEffect(() => {
    if (isThinking) {
      setOpen(true);
    } else if (thinkingDuration !== undefined) {
      setOpen(false);
    }
  }, [isThinking, thinkingDuration]);

  return (
    <Collapsible
      className={cn("group not-prose mb-2 w-full", className)}
      open={open}
      onOpenChange={setOpen}
      {...props}
    />
  );
};

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  isThinking?: boolean;
  thinkingDuration?: number;
};

export const ReasoningTrigger = ({
  className,
  isThinking,
  thinkingDuration,
  ...props
}: ReasoningTriggerProps) => {
  const seconds = thinkingDuration !== undefined
    ? Math.round(thinkingDuration / 1000)
    : undefined;

  return (
    <CollapsibleTrigger
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors",
        className
      )}
      {...props}
    >
      <BrainIcon className={cn("size-3.5", isThinking && "animate-pulse")} />
      <span>
        {isThinking
          ? "Thinking..."
          : `Thought for ${seconds} seconds`}
      </span>
      <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent>;

export const ReasoningContent = ({ className, ...props }: ReasoningContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=open]:animate-in mt-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground",
      className
    )}
    {...props}
  />
);
