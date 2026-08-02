import { memo, type ComponentProps, type ReactElement } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { cn } from "@/lib/utils";

type MessageResponseExtras = Pick<
  ComponentProps<typeof MessageResponse>,
  "allowedTags" | "components"
>;

export type AssistantProseBubbleProps = MessageResponseExtras & {
  readonly markdown: string;
  readonly isAnimating?: boolean;
  readonly contentClassName?: string;
};

/** Shared assistant Bubble + MessageResponse chrome (incl. Error → destructive). */
export const AssistantProseBubble = memo(function AssistantProseBubble({
  markdown,
  isAnimating = false,
  contentClassName,
  allowedTags,
  components,
}: AssistantProseBubbleProps): ReactElement {
  const isError = markdown.startsWith("Error");

  return (
    <Bubble
      variant={isError ? "destructive" : "ghost"}
      align="start"
      className={
        isError ? "w-full max-w-full text-foreground font-[350]" : "text-foreground px-1 font-[350]"
      }
    >
      <BubbleContent className={cn(isError ? "w-full" : undefined, contentClassName)}>
        <MessageResponse
          isAnimating={isAnimating}
          allowedTags={allowedTags}
          components={components}
        >
          {markdown}
        </MessageResponse>
      </BubbleContent>
    </Bubble>
  );
});
