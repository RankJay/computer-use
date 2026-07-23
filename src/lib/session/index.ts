/**
 * Public surface for the live Mandate/Attempt host.
 * Fold/engine/control internals: import from `@/lib/session/<path>`.
 */

export type {
  RuntimeEvent,
  RuntimeEventPayload,
  RunStatus,
  UIMessagePartSnapshot,
  LanguageModelUsageSnapshot,
  PermissionDecision,
} from "./events";
export { RUNTIME_EVENT_SCHEMA_VERSION, isRuntimeEvent, runStatusSchema } from "./events";

export type {
  AgentTranscriptRow,
  AgentMarkerRow,
  AgentMessageRowData,
  AgentChainOfThoughtRow,
  AgentTaskRow,
  AgentChainOfThoughtStep,
  AgentTaskItem,
} from "./rows";

export type {
  MandateProjection,
  AttemptFailure,
  AttemptUsage,
  AttemptBudget,
  PendingPermission,
} from "./projection";
export {
  createEmptyMandateProjection,
  EMPTY_PENDING_PERMISSIONS,
  EMPTY_ATTEMPT_BUDGET,
  EMPTY_ATTEMPT_USAGE,
} from "./projection";

export type { RunExecutionContext } from "./run-execution-context";

export { getAttemptHost, registerAttemptHost, resetAttemptHost } from "./attempt-host-registry";

export {
  createAttemptHost,
  type AttemptHostDeps,
  type AttemptHostListener,
  type BatchedAttemptStore,
} from "./attempt-host";

export { AttemptHostContext, useAttemptHost } from "./attempt-host-context";

export {
  planRegenerateFromAssistant,
  textPartsMarkdown,
  type RegeneratePlan,
} from "./control/regenerate-from-message";

export { deriveAttemptControls, type AttemptControls } from "./control/derive-attempt-controls";

export {
  createOsLease,
  type OsLease,
  type OsLeaseAcquireResult,
  type OsLeaseHolder,
  type OsLeaseScope,
} from "./control/os-lease";
export { osLeaseScopeOf } from "./control/os-lease-scope";

export { deriveDisplayRows } from "./presentation/derive-display-rows";

export { isLiveWorkspaceReady } from "./live-workspace";

// Demo/live producers are loaded via dynamic import inside createProduceRun —
// do not statically re-export them from this barrel (defeats cold-start splitting).
export { createProduceRun } from "./producers/select-producer";
