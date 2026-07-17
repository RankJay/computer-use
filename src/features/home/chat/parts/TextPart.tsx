import type { TextUIPart } from "ai";
import { lazy, memo, Suspense, type ReactElement } from "react";

import { Bubble, BubbleContent } from "@/components/ui/bubble";

const MessageResponse = lazy(() =>
  import("@/components/ai-elements/message").then((mod) => ({ default: mod.MessageResponse })),
);

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
    <Bubble variant={bubbleVariant} align="start" className="text-foreground px-1 font-[350]">
      <BubbleContent>
        <Suspense fallback={<span className="whitespace-pre-wrap">{part.text}</span>}>
          <MessageResponse isAnimating={isAnimating}>{part.text}</MessageResponse>
        </Suspense>
      </BubbleContent>
    </Bubble>
  );
});
