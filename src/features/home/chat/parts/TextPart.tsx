import type { TextUIPart } from "ai";
import { memo, type ReactElement } from "react";

import { AssistantProseBubble } from "./AssistantProseBubble";

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

  return <AssistantProseBubble markdown={part.text} isAnimating={isAnimating} />;
});
