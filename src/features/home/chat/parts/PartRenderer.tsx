import {
  isCustomContentUIPart,
  isDataUIPart,
  isDynamicToolUIPart,
  isFileUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type SourceUrlUIPart,
  type UIMessage,
} from "ai";
import { memo, type ReactElement, type ReactNode } from "react";

import { Bubble, BubbleContent } from "@/components/ui/bubble";

import { ReasoningPart } from "./ReasoningPart";
import { SourcesPart } from "./SourcesPart";
import { TextPart } from "./TextPart";
import { ToolPart } from "./ToolPart";

export type PartRendererProps = {
  readonly message: UIMessage;
  readonly isStreaming?: boolean;
};

export const PartRenderer = memo(function PartRenderer({
  message,
  isStreaming = false,
}: PartRendererProps): ReactElement {
  return <>{renderMessageParts(message, isStreaming)}</>;
});

function renderMessageParts(message: UIMessage, isStreaming: boolean): ReactNode[] {
  const elements: ReactNode[] = [];
  let index = 0;

  while (index < message.parts.length) {
    const part = message.parts[index];
    if (!part) {
      index += 1;
      continue;
    }

    if (part.type === "source-url") {
      const sourceParts: SourceUrlUIPart[] = [];
      const startIndex = index;
      while (index < message.parts.length && message.parts[index]?.type === "source-url") {
        const sourcePart = message.parts[index];
        if (sourcePart?.type === "source-url") {
          sourceParts.push(sourcePart);
        }
        index += 1;
      }
      elements.push(<SourcesPart key={`sources-${startIndex}`} parts={sourceParts} />);
      continue;
    }

    if (isReasoningUIPart(part)) {
      const reasoningParts = [];
      const startIndex = index;
      while (index < message.parts.length && isReasoningUIPart(message.parts[index])) {
        const reasoningPart = message.parts[index];
        if (reasoningPart && isReasoningUIPart(reasoningPart)) {
          reasoningParts.push(reasoningPart);
        }
        index += 1;
      }
      const last = reasoningParts[reasoningParts.length - 1];
      elements.push(
        <ReasoningPart
          key={`reasoning-${startIndex}`}
          text={reasoningParts.map((part) => part.text).join("\n\n")}
          isStreaming={isStreaming && last?.state === "streaming"}
        />,
      );
      continue;
    }

    if (isTextUIPart(part)) {
      elements.push(
        <TextPart
          key={`text-${index}`}
          part={part}
          messageRole={message.role}
          isAnimating={isStreaming}
        />,
      );
      index += 1;
      continue;
    }

    if (isToolUIPart(part) || isDynamicToolUIPart(part)) {
      elements.push(<ToolPart key={`tool-${index}`} part={part} />);
      index += 1;
      continue;
    }

    if (isFileUIPart(part)) {
      elements.push(
        <Bubble key={`file-${index}`} variant="outline" align="start">
          <BubbleContent>
            <a
              href={part.url}
              rel="noreferrer"
              target="_blank"
              className="underline underline-offset-2"
            >
              {part.filename ?? "Attachment"}
            </a>
          </BubbleContent>
        </Bubble>,
      );
      index += 1;
      continue;
    }

    if (part.type === "source-document") {
      elements.push(
        <Bubble key={`source-doc-${index}`} variant="outline" align="start">
          <BubbleContent>{part.title}</BubbleContent>
        </Bubble>,
      );
      index += 1;
      continue;
    }

    if (part.type === "step-start" || part.type === "reasoning-file") {
      index += 1;
      continue;
    }

    if (isDataUIPart(part)) {
      elements.push(
        <Bubble key={`data-${index}`} variant="muted" align="start">
          <BubbleContent>{JSON.stringify(part.data)}</BubbleContent>
        </Bubble>,
      );
      index += 1;
      continue;
    }

    if (isCustomContentUIPart(part)) {
      elements.push(
        <Bubble key={`custom-${index}`} variant="muted" align="start">
          <BubbleContent>{part.kind}</BubbleContent>
        </Bubble>,
      );
      index += 1;
      continue;
    }

    const _exhaustive: never = part;
    void _exhaustive;
    index += 1;
  }

  return elements;
}
