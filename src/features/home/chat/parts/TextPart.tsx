import type { TextUIPart } from "ai";
import { memo, type ReactElement } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";

export type TextPartProps = {
  readonly part: TextUIPart;
  readonly messageRole: "user" | "assistant" | "system";
  readonly isAnimating?: boolean;
};

export const TextPart = memo(function TextPart({
  part,
  messageRole,
  isAnimating = false,
}: TextPartProps): ReactElement {
  if (messageRole === "user") {
    return (
      <div className="text-sm bg-[#161616] px-3 py-2.5 rounded-xl whitespace-pre-wrap text-foreground">
        {part.text}
      </div>
    );
  }

  const bubbleVariant = part.text.startsWith("Error") ? "destructive" : "ghost";

  return (
    <Bubble variant={bubbleVariant} align="start" className="text-foreground font-[350]">
      <BubbleContent>
        <MessageResponse isAnimating={isAnimating}>{part.text}</MessageResponse>
      </BubbleContent>
    </Bubble>
  );
});
