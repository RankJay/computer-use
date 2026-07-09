import type { ReasoningUIPart } from "ai";
import { memo, type ReactElement } from "react";

import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";

export type ReasoningPartProps = {
  readonly text: string;
  readonly isStreaming?: boolean;
};

export const ReasoningPart = memo(function ReasoningPart({
  text,
  isStreaming = false,
}: ReasoningPartProps): ReactElement {
  return (
    <Reasoning isStreaming={isStreaming}>
      <ReasoningTrigger />
      <ReasoningContent>{text}</ReasoningContent>
    </Reasoning>
  );
});

export function reasoningTextFromParts(parts: readonly ReasoningUIPart[]): string {
  return parts.map((part) => part.text).join("\n\n");
}
