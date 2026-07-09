import { isDynamicToolUIPart, type DynamicToolUIPart, type ToolUIPart } from "ai";
import { CheckIcon, XIcon } from "lucide-react";
import { memo, type ReactElement } from "react";

import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";

export type ToolPartProps = {
  readonly part: ToolUIPart | DynamicToolUIPart;
};

export const ToolPart = memo(function ToolPart({ part }: ToolPartProps): ReactElement {
  const showApproval =
    part.state === "approval-requested" ||
    part.state === "approval-responded" ||
    part.state === "output-denied";

  const headerProps = isDynamicToolUIPart(part)
    ? { type: part.type, state: part.state, toolName: part.toolName }
    : { type: part.type, state: part.state };

  return (
    <div className="space-y-2">
      <Tool
        className="border-none ring-1 ring-border rounded-xl bg-[#161616]"
        defaultOpen={part.state === "output-available" || part.state === "output-error"}
      >
        <ToolHeader className="text-foreground font-[350]" {...headerProps} />
        <ToolContent>
          {"input" in part && part.input !== undefined ? <ToolInput input={part.input} /> : null}
          <ToolOutput
            output={"output" in part ? part.output : undefined}
            errorText={"errorText" in part ? part.errorText : undefined}
          />
        </ToolContent>
      </Tool>
      {showApproval && "approval" in part ? (
        <Confirmation
          className="border-none ring-1 ring-border rounded-xl bg-[#161616]"
          approval={part.approval}
          state={part.state}
        >
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
            <ConfirmationAction variant="outline" disabled>
              Reject
            </ConfirmationAction>
            <ConfirmationAction disabled>Approve</ConfirmationAction>
          </ConfirmationActions>
        </Confirmation>
      ) : null}
    </div>
  );
});
