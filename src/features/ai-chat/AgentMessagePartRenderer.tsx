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
import { CheckIcon, XIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import { MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import { Bubble, BubbleContent } from "@/components/ui/bubble";

type AgentMessagePart = UIMessage["parts"][number];

type AgentMessagePartRendererProps = {
  readonly part: AgentMessagePart;
  readonly messageRole: UIMessage["role"];
  readonly isStreaming?: boolean;
};

function ToolBlock({ part }: { readonly part: ToolPart }): ReactElement {
  const showApproval =
    part.state === "approval-requested" ||
    part.state === "approval-responded" ||
    part.state === "output-denied";

  const headerProps = isDynamicToolUIPart(part)
    ? { type: part.type, state: part.state, toolName: part.toolName }
    : { type: part.type, state: part.state };

  return (
    <div className="space-y-2">
      <Tool defaultOpen={part.state === "output-available" || part.state === "output-error"}>
        <ToolHeader {...headerProps} />
        <ToolContent>
          {"input" in part && part.input !== undefined ? <ToolInput input={part.input} /> : null}
          <ToolOutput output={part.output} errorText={part.errorText} />
        </ToolContent>
      </Tool>
      {showApproval && "approval" in part ? (
        <Confirmation approval={part.approval} state={part.state}>
          <ConfirmationTitle>
            <ConfirmationRequest>This tool wants to run. Approve execution?</ConfirmationRequest>
            <ConfirmationAccepted>
              <CheckIcon className="size-4" />
              <span>You approved this tool execution</span>
            </ConfirmationAccepted>
            <ConfirmationRejected>
              <XIcon className="size-4" />
              <span>You rejected this tool execution</span>
            </ConfirmationRejected>
          </ConfirmationTitle>
          <ConfirmationActions>
            <ConfirmationAction variant="outline">Reject</ConfirmationAction>
            <ConfirmationAction>Approve</ConfirmationAction>
          </ConfirmationActions>
        </Confirmation>
      ) : null}
    </div>
  );
}

function SourcesBlock({ parts }: { readonly parts: SourceUrlUIPart[] }): ReactElement {
  return (
    <Sources>
      <SourcesTrigger count={parts.length} />
      <SourcesContent>
        {parts.map((part) => (
          <Source href={part.url} key={part.sourceId} title={part.title ?? part.url} />
        ))}
      </SourcesContent>
    </Sources>
  );
}

export function AgentMessagePartRenderer({
  part,
  messageRole,
  isStreaming = false,
}: AgentMessagePartRendererProps): ReactElement | null {
  if (isTextUIPart(part)) {
    if (messageRole === "user") {
      return (
        <div className="text-sm bg-[#161616] px-3 py-2.5 mb-4 rounded-xl whitespace-pre-wrap text-[#cdcdcd]">
          {part.text}
        </div>
      );
    }

    const bubbleVariant = part.text.startsWith("Error") ? "destructive" : "ghost";

    return (
      <Bubble variant={bubbleVariant} align="start">
        <BubbleContent>
          <MessageResponse>{part.text}</MessageResponse>
        </BubbleContent>
      </Bubble>
    );
  }

  if (isReasoningUIPart(part)) {
    return (
      <Reasoning isStreaming={isStreaming && part.state === "streaming"}>
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }

  if (isToolUIPart(part)) {
    return <ToolBlock part={part} />;
  }

  if (isFileUIPart(part)) {
    return (
      <Bubble variant="outline" align="start">
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
      </Bubble>
    );
  }

  if (part.type === "source-url") {
    return <SourcesBlock parts={[part]} />;
  }

  if (part.type === "source-document") {
    return (
      <Bubble variant="outline" align="start">
        <BubbleContent>{part.title}</BubbleContent>
      </Bubble>
    );
  }

  if (part.type === "step-start" || part.type === "reasoning-file") {
    return null;
  }

  if (isDataUIPart(part)) {
    return (
      <Bubble variant="muted" align="start">
        <BubbleContent>{JSON.stringify(part.data)}</BubbleContent>
      </Bubble>
    );
  }

  if (isCustomContentUIPart(part)) {
    return (
      <Bubble variant="muted" align="start">
        <BubbleContent>{part.kind}</BubbleContent>
      </Bubble>
    );
  }

  const _exhaustive: never = part;
  return _exhaustive;
}

type RenderMessagePartsOptions = {
  readonly message: UIMessage;
  readonly isStreaming?: boolean;
};

export function renderAgentMessageParts({
  message,
  isStreaming = false,
}: RenderMessagePartsOptions): ReactNode[] {
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
      while (index < message.parts.length && message.parts[index]?.type === "source-url") {
        const sourcePart = message.parts[index];
        if (sourcePart?.type === "source-url") {
          sourceParts.push(sourcePart);
        }
        index += 1;
      }
      elements.push(<SourcesBlock key={`sources-${index}`} parts={sourceParts} />);
      continue;
    }

    if (isReasoningUIPart(part)) {
      const reasoningParts: string[] = [];
      while (index < message.parts.length && isReasoningUIPart(message.parts[index])) {
        const reasoningPart = message.parts[index];
        if (reasoningPart && isReasoningUIPart(reasoningPart)) {
          reasoningParts.push(reasoningPart.text);
        }
        index += 1;
      }
      elements.push(
        <Reasoning key={`reasoning-${index}`} isStreaming={isStreaming}>
          <ReasoningTrigger />
          <ReasoningContent>{reasoningParts.join("\n\n")}</ReasoningContent>
        </Reasoning>,
      );
      continue;
    }

    elements.push(
      <AgentMessagePartRenderer
        key={`${part.type}-${index}`}
        isStreaming={isStreaming}
        messageRole={message.role}
        part={part}
      />,
    );
    index += 1;
  }

  return elements;
}
