import type { HostOsKind } from "@/agent/hostEnvironment";
import type { AgentNativeBridge } from "@/agent/nativeBridge";
import type { AgentToolName, ConsequenceRiskClass } from "@/agent/toolContract";
import type { AgentEvent, PermissionChoice, PermissionMode } from "@/agent/types";

export type EmitFn = (event: AgentEvent) => void;

/** Per-run context passed into AI tool executors (permission + logging + native bridge). */
export type LiveAgentToolContext = {
  taskId: string;
  native: AgentNativeBridge | null;
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
