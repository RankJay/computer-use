import { isUiAutomationTool, toolRequiresPermissionPrompt } from "@/agent/permissionPolicy";
import {
  type AgentToolName,
  type ConsequenceRiskClass,
  TOOL_CONTRACT,
  formatRiskLineForTool,
  riskClassForTool,
} from "@/agent/toolContract";
import { createEventId } from "@/agent/types";
import type {
  AgentEvent,
  PermissionChoice,
  PermissionMode,
  PermissionRequestedEvent,
} from "@/agent/types";

export type PermissionRequestCopy = {
  readonly summary: string;
  readonly rationale: string;
  readonly details: string;
};

export type PermissionOrchestrationContext = {
  readonly taskId: string;
  readonly permissionMode: PermissionMode;
  readonly uiAutomationEnabled: boolean;
  readonly persistedToolApprovals: ReadonlySet<string>;
  readonly sessionRiskApproved: Set<ConsequenceRiskClass>;
  readonly emit: (event: AgentEvent) => void;
  readonly waitForPermission: (permissionId: string) => Promise<PermissionChoice>;
  readonly persistAlwaysAllow: (tool: AgentToolName) => Promise<void>;
  readonly appendStructuredLog: (event: AgentEvent) => Promise<void>;
};

export class PermissionResolverLifecycle {
  private readonly resolvers = new Map<string, (choice: PermissionChoice) => void>();

  waitForChoice(permissionId: string): Promise<PermissionChoice> {
    return new Promise((resolve) => {
      this.resolvers.set(permissionId, resolve);
    });
  }

  resolve(permissionId: string, choice: PermissionChoice): boolean {
    const resolver = this.resolvers.get(permissionId);
    if (!resolver) return false;

    resolver(choice);
    this.resolvers.delete(permissionId);
    return true;
  }

  cancelAll(choice: PermissionChoice = "deny"): void {
    for (const [permissionId, resolver] of this.resolvers) {
      resolver(choice);
      this.resolvers.delete(permissionId);
    }
  }

  get pendingCount(): number {
    return this.resolvers.size;
  }
}

export function createPendingPermissionEvent(
  ctx: Pick<PermissionOrchestrationContext, "taskId">,
  toolName: AgentToolName,
  copy: PermissionRequestCopy,
): PermissionRequestedEvent {
  return {
    id: createEventId(),
    at: Date.now(),
    taskId: ctx.taskId,
    type: "permission.requested",
    permissionId: createEventId(),
    toolName,
    title: TOOL_CONTRACT[toolName].defaultPermissionTitle,
    summary: copy.summary,
    rationale: copy.rationale,
    risk: formatRiskLineForTool(toolName),
    details: copy.details,
  };
}

export async function requestToolPermission(
  ctx: PermissionOrchestrationContext,
  toolName: AgentToolName,
  copy: PermissionRequestCopy,
): Promise<boolean> {
  if (isUiAutomationTool(toolName) && !ctx.uiAutomationEnabled) {
    return false;
  }
  if (ctx.persistedToolApprovals.has(toolName)) {
    return true;
  }

  const riskClass = riskClassForTool(toolName);
  if (ctx.sessionRiskApproved.has(riskClass)) {
    return true;
  }
  if (!toolRequiresPermissionPrompt(ctx.permissionMode, toolName)) {
    return true;
  }

  const requestEvent = createPendingPermissionEvent(ctx, toolName, copy);
  ctx.emit(requestEvent);
  await ctx.appendStructuredLog(requestEvent);

  const choice = await ctx.waitForPermission(requestEvent.permissionId);
  const resolvedEvent: AgentEvent = {
    id: createEventId(),
    at: Date.now(),
    taskId: ctx.taskId,
    type: "permission.resolved",
    permissionId: requestEvent.permissionId,
    choice,
  };
  ctx.emit(resolvedEvent);
  await ctx.appendStructuredLog(resolvedEvent);

  switch (choice) {
    case "deny":
      return false;
    case "allow_once":
      return true;
    case "allow_session":
      ctx.sessionRiskApproved.add(riskClass);
      return true;
    case "allow_always":
      await ctx.persistAlwaysAllow(toolName);
      return true;
    default: {
      const _never: never = choice;
      return _never;
    }
  }
}
