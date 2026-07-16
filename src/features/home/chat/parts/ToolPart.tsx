import { isDynamicToolUIPart, type DynamicToolUIPart, type ToolUIPart } from "ai";
import {
  AppWindowIcon,
  ChevronDownIcon,
  ClipboardIcon,
  EyeIcon,
  FileCode2Icon,
  KeyboardIcon,
  type LucideIcon,
  MousePointer2Icon,
  TerminalIcon,
  TimerIcon,
} from "lucide-react";
import { memo, useState, type ReactElement } from "react";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toolActivityDetail, uiToolLabel } from "@/lib/agent/capabilities";
import { isMacOsClient } from "@/lib/platform";
import type { PendingPermission } from "@/lib/session";
import type { PermissionMode } from "@/lib/settings/types";
import { cn } from "@/lib/utils";

/** Category glyph for activity rows — same role as Reasoning's brain icon. */
function toolActivityIcon(toolName: string): LucideIcon {
  if (toolName.startsWith("accessibility_")) {
    return EyeIcon;
  }
  if (toolName.startsWith("mouse_")) {
    return MousePointer2Icon;
  }
  if (toolName.startsWith("key_") || toolName === "hotkey") {
    return KeyboardIcon;
  }
  if (toolName.startsWith("window_") || toolName === "get_active_window" || toolName === "launch") {
    return AppWindowIcon;
  }
  if (toolName.includes("clipboard")) {
    return ClipboardIcon;
  }
  if (
    toolName === "run_shell" ||
    toolName.startsWith("process_") ||
    toolName === "get_env" ||
    toolName === "set_env" ||
    toolName === "get_system_info"
  ) {
    return TerminalIcon;
  }
  if (
    toolName.includes("file") ||
    toolName.includes("directory") ||
    toolName.includes("path") ||
    toolName === "search_files"
  ) {
    return FileCode2Icon;
  }
  if (toolName === "wait") {
    return TimerIcon;
  }
  return TerminalIcon;
}

export type ToolPartProps = {
  readonly part: ToolUIPart | DynamicToolUIPart;
  readonly pendingPermissions?: readonly PendingPermission[];
  readonly permissionMode?: PermissionMode;
  readonly onResolvePermission?: (
    callId: string,
    decision: "approved" | "denied",
    persist?: boolean,
  ) => void;
};

const EMPTY_PENDING_PERMISSIONS: readonly PendingPermission[] = [];

function toolNameFromPart(part: ToolUIPart | DynamicToolUIPart): string {
  if (isDynamicToolUIPart(part)) {
    return part.toolName;
  }
  if (part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  return part.type;
}

/** Tools that observe or control other apps (OS privacy / Accessibility impact). */
function needsOsPrivacyNotice(toolName: string): boolean {
  return (
    toolName.startsWith("accessibility_") ||
    toolName.startsWith("mouse_") ||
    toolName.startsWith("key_") ||
    toolName === "hotkey" ||
    toolName.startsWith("window_")
  );
}

function approvalRequestCopy(toolName: string): string {
  if (needsOsPrivacyNotice(toolName)) {
    return isMacOsClient()
      ? "Can observe or control other apps (macOS Accessibility / input)."
      : "Can observe or control other apps.";
  }
  return "Needs your approval to run.";
}

function isActiveState(state: ToolUIPart["state"] | DynamicToolUIPart["state"]): boolean {
  return (
    state === "input-streaming" || state === "input-available" || state === "approval-responded"
  );
}

export const ToolPart = memo(function ToolPart({
  part,
  pendingPermissions = EMPTY_PENDING_PERMISSIONS,
  permissionMode = "risky",
  onResolvePermission,
}: ToolPartProps): ReactElement {
  const [persistAlways, setPersistAlways] = useState(false);

  const toolCallId = part.toolCallId;
  const isPending = pendingPermissions.some((entry) => entry.callId === toolCallId);
  const canAct =
    part.state === "approval-requested" && isPending && typeof onResolvePermission === "function";
  const showAlwaysAllow = canAct && permissionMode === "once-per-class";
  const showApprovalActions = part.state === "approval-requested";

  const toolName = toolNameFromPart(part);
  const title = uiToolLabel(toolName);
  const detail =
    "input" in part && part.input !== undefined ? toolActivityDetail(toolName, part.input) : null;
  const errorText =
    "errorText" in part && typeof part.errorText === "string" ? part.errorText : null;
  const isFailed = part.state === "output-error" || Boolean(errorText);
  const isDenied = part.state === "output-denied";
  const isActive = isActiveState(part.state);
  const canExpand = Boolean(errorText);

  const labelPrefix = isDenied ? "Skipped" : isFailed ? "Failed" : null;
  const ActivityIcon = toolActivityIcon(toolName);

  const labelNode = isActive ? (
    <Shimmer as="span" duration={1}>
      {title}
    </Shimmer>
  ) : (
    <span>{title}</span>
  );

  const activityLine = (
    <>
      <ActivityIcon className="size-4 shrink-0" aria-hidden />
      <span
        className={cn(
          "min-w-0 truncate",
          isFailed && !isActive ? "text-destructive/80" : undefined,
        )}
      >
        {labelPrefix ? <span>{labelPrefix} · </span> : null}
        {labelNode}
        {detail ? <span className="text-muted-foreground/80"> · {detail}</span> : null}
      </span>
    </>
  );

  return (
    <div className="space-y-2 px-1">
      {canExpand ? (
        <Collapsible className="group">
          <CollapsibleTrigger
            className={cn(
              "flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
              isFailed && "text-destructive/80 hover:text-destructive",
            )}
          >
            {activityLine}
            <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-open:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 text-sm outline-none">
            <p className="whitespace-pre-wrap wrap-break-word text-destructive/90">{errorText}</p>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <div className="flex w-full items-center gap-2 text-muted-foreground text-sm">
          {activityLine}
        </div>
      )}

      {showApprovalActions ? (
        <div className="space-y-2 pl-0.5">
          <p className="text-xs text-muted-foreground">{approvalRequestCopy(toolName)}</p>
          {showAlwaysAllow ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={persistAlways}
                onChange={(event) => setPersistAlways(event.target.checked)}
              />
              Always allow this tool
            </label>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canAct}
              onClick={() => onResolvePermission?.(toolCallId, "denied")}
            >
              Reject
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canAct}
              onClick={() => onResolvePermission?.(toolCallId, "approved", persistAlways)}
            >
              Approve
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
});
