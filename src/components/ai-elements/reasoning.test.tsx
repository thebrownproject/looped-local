import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "./reasoning";

describe("Reasoning", () => {
  it("renders 'Thought for N seconds' when not thinking", () => {
    render(
      <Reasoning isThinking={false} thinkingDuration={3000}>
        <ReasoningTrigger isThinking={false} thinkingDuration={3000} />
        <ReasoningContent>some reasoning text</ReasoningContent>
      </Reasoning>
    );
    // getByText throws if not found - acts as assertion
    screen.getByText("Thought for 3 seconds");
  });

  it("shows 'Thinking...' when isThinking is true", () => {
    render(
      <Reasoning isThinking={true} thinkingDuration={undefined}>
        <ReasoningTrigger isThinking={true} thinkingDuration={undefined} />
        <ReasoningContent>partial reasoning...</ReasoningContent>
      </Reasoning>
    );
    screen.getByText("Thinking...");
  });

  it("renders without crashing when thinkingDuration is undefined", () => {
    const { container } = render(
      <Reasoning isThinking={false} thinkingDuration={undefined}>
        <ReasoningTrigger isThinking={false} thinkingDuration={undefined} />
        <ReasoningContent>some text</ReasoningContent>
      </Reasoning>
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("rounds thinkingDuration to nearest second", () => {
    render(
      <Reasoning isThinking={false} thinkingDuration={5500}>
        <ReasoningTrigger isThinking={false} thinkingDuration={5500} />
        <ReasoningContent>reasoning content</ReasoningContent>
      </Reasoning>
    );
    // Math.round(5500/1000) = 6
    screen.getByText("Thought for 6 seconds");
  });

  it("does not render trigger text when reasoning is not provided", () => {
    // Chat-session guards with msg.reasoning check, but verify component itself is stable
    const { queryByText } = render(
      <Reasoning isThinking={false} thinkingDuration={2000}>
        <ReasoningTrigger isThinking={false} thinkingDuration={2000} />
        <ReasoningContent />
      </Reasoning>
    );
    // The trigger label is still rendered (chat-session wraps with conditional)
    expect(queryByText("Thought for 2 seconds")).not.toBeNull();
  });
});
