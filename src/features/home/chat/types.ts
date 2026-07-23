import type { PendingInteraction, PermissionDecision } from "@/lib/session";
import type { PermissionMode } from "@/lib/settings/types";

export type {
  AgentTranscriptRow,
  AgentMarkerRow,
  AgentMessageRowData,
  AgentChainOfThoughtRow,
  AgentTaskRow,
  AgentChainOfThoughtStep,
  AgentTaskItem,
} from "@/lib/session";

/** Shared chat UI props for permission escalation resolve. */
export type PermissionResolveProps = {
  readonly pendingInteractions?: readonly PendingInteraction[];
  readonly permissionMode?: PermissionMode;
  readonly onResolvePermission?: (
    callId: string,
    decision: PermissionDecision,
    persist?: boolean,
  ) => void;
};
