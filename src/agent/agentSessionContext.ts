import type { HostOsKind } from "@/agent/hostEnvironment";
import type { AgentNativeBridge } from "@/agent/native/nativeBridge";
import type { AgentToolName, ConsequenceRiskClass } from "@/agent/toolContract";
import type { AgentEvent, EmitFn, PermissionChoice, PermissionMode } from "@/agent/types";
import type { WorkspaceAdapter } from "@/agent/workspace/workspaceAdapter";

export type LiveAgentToolContext = {
  taskId: string;
  native: AgentNativeBridge | null;
  workspaceFiles: WorkspaceAdapter;
  hostOs: HostOsKind;
  workspaceRoot: string | null;
  permissionMode: PermissionMode;
  uiAutomationEnabled: boolean;
  persistedToolApprovals: Set<string>;
  sessionRiskApproved: Set<ConsequenceRiskClass>;
  vision: { latestPng: string | null };
  emit: EmitFn;
  waitForPermission: (permissionId: string) => Promise<PermissionChoice>;
  persistAlwaysAllow: (tool: AgentToolName) => Promise<void>;
  appendStructuredLog: (event: AgentEvent) => Promise<void>;
};
