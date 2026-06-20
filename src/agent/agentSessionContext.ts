import type { HostOsKind } from "@/agent/hostEnvironment";
import type { AgentNativeBridge, DisplayCaptureResult } from "@/agent/native/nativeBridge";
import type { AgentToolName, ConsequenceRiskClass } from "@/agent/toolContract";
import type { UiAutomationRunState } from "@/agent/tools/uiAutomationState";
import type { AgentEvent, EmitFn, PermissionChoice, PermissionMode } from "@/agent/types";
import type { WorkspaceAdapter } from "@/agent/workspace/workspaceAdapter";

export type LiveAgentToolContext = {
  taskId: string;
  native: AgentNativeBridge | null;
  workspaceFiles: WorkspaceAdapter;
  hostOs: HostOsKind;
  workspaceRoot: string | null;
  signal: AbortSignal;
  permissionMode: PermissionMode;
  uiAutomationEnabled: boolean;
  persistedToolApprovals: Set<string>;
  sessionRiskApproved: Set<ConsequenceRiskClass>;
  vision: { latestCapture: DisplayCaptureResult | null };
  uiAutomation: UiAutomationRunState;
  emit: EmitFn;
  waitForPermission: (permissionId: string) => Promise<PermissionChoice>;
  persistAlwaysAllow: (tool: AgentToolName) => Promise<void>;
  appendStructuredLog: (event: AgentEvent) => Promise<void>;
};
