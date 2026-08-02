import {
  isCustomContentUIPart,
  isDataUIPart,
  isDynamicToolUIPart,
  isFileUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type UIMessage,
} from "ai";
import { memo, type ReactElement, type ReactNode } from "react";

import { Bubble, BubbleContent } from "@/components/ui/bubble";

import type { PermissionResolveProps } from "../types";
import { buildProseCitationRun, collectProseRunParts, isProseRunPart } from "./prose-citation-run";
import { ProseWithCitationsPart } from "./ProseWithCitationsPart";
import { ReasoningPart } from "./ReasoningPart";
import { TextPart } from "./TextPart";
import { ToolPart } from "./ToolPart";

export type PartRendererProps = PermissionResolveProps & {
  readonly message: UIMessage;
  readonly isStreaming?: boolean;
};

export const PartRenderer = memo(function PartRenderer({
  message,
  isStreaming = false,
  pendingInteractions,
  permissionMode,
  onResolvePermission,
}: PartRendererProps): ReactElement {
  return (
    <>
      {renderMessageParts(message, isStreaming, {
        pendingInteractions,
        permissionMode,
        onResolvePermission,
      })}
    </>
  );
});

function lastStreamingTextPartIndex(parts: UIMessage["parts"]): number {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    if (part && isTextUIPart(part)) {
      return i;
    }
  }
  return -1;
}

function renderMessageParts(
  message: UIMessage,
  isStreaming: boolean,
  permission: PermissionResolveProps,
): ReactNode[] {
  const elements: ReactNode[] = [];
  let index = 0;
  const activeTextIndex = isStreaming ? lastStreamingTextPartIndex(message.parts) : -1;

  while (index < message.parts.length) {
    const part = message.parts[index];
    if (!part) {
      index += 1;
      continue;
    }

    // Text interrupted only by source-url → summary Sources + inline cites in one Streamdown.
    if (isProseRunPart(part)) {
      const startIndex = index;
      const { runParts, endIndex } = collectProseRunParts(message.parts, index);
      index = endIndex;

      const run = buildProseCitationRun(runParts);
      const runIncludesActiveText =
        isStreaming && activeTextIndex >= startIndex && activeTextIndex < endIndex;

      const firstSegment = run.segments[0];
      const onlyPlainText =
        run.summarySources.length === 0 &&
        run.segments.length === 1 &&
        firstSegment !== undefined &&
        firstSegment.citations.length === 0;

      if (onlyPlainText) {
        elements.push(
          <TextPart
            key={`text-${startIndex}`}
            part={{ type: "text", text: firstSegment.text }}
            messageRole={message.role}
            isAnimating={runIncludesActiveText}
          />,
        );
        continue;
      }

      if (run.summarySources.length === 0 && run.segments.length === 0) {
        continue;
      }

      elements.push(
        <ProseWithCitationsPart
          key={`prose-${startIndex}`}
          summarySources={run.summarySources}
          segments={run.segments}
          isAnimating={runIncludesActiveText}
        />,
      );
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
          text={reasoningParts.map((reasoningPart) => reasoningPart.text).join("\n\n")}
          isStreaming={isStreaming && last?.state === "streaming"}
        />,
      );
      continue;
    }

    if (isToolUIPart(part) || isDynamicToolUIPart(part)) {
      elements.push(
        <ToolPart
          key={`tool-${index}`}
          part={part}
          pendingInteractions={permission.pendingInteractions}
          permissionMode={permission.permissionMode}
          onResolvePermission={permission.onResolvePermission}
        />,
      );
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
