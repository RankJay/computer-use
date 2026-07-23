export type {
  RuntimeEvent,
  RuntimeEventPayload,
  RunStatus,
  UIMessagePartSnapshot,
  LanguageModelUsageSnapshot,
} from "./events";
export { RUNTIME_EVENT_SCHEMA_VERSION, isRuntimeEvent } from "./events";

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

export type { ExecutionContext, ExecutionContextOptions } from "./execution-context";
export {
  DEFAULT_EXECUTION_CONTEXT_OPTIONS,
  PASSTHROUGH_EXECUTION_CONTEXT_OPTIONS,
  foldExecutionContext,
} from "./execution-context";

export {
  createFoldState,
  foldStateFromMessages,
  reduceSession,
  projectSession,
  toProjection,
  type FoldState,
} from "./project-session";

export {
  createSessionEngine,
  type SessionEngine,
  type SessionEngineDeps,
  type RetryFromMessageConfig,
  type LedgerHydrateInput,
} from "./engine";

export {
  planRegenerateFromAssistant,
  textPartsMarkdown,
  type RegeneratePlan,
} from "./control/regenerate-from-message";

export { getAttemptHost, registerAttemptHost, resetAttemptHost } from "./attempt-host-registry";

export {
  createAttemptHost,
  type AttemptHostDeps,
  type AttemptHostListener,
  type BatchedAttemptStore,
} from "./attempt-host";

export {
  createAttemptControl,
  type AttemptControl,
  type AttemptControlDeps,
  type AttemptIds,
  type AttemptStartError,
  type AttemptStartInput,
  type AttemptStartOk,
  type AttemptStartResult,
  type LoadedRunContext,
} from "./control/attempt-control";

export {
  createAttemptRegistry,
  type AttemptRegistry,
  type LiveAttempt,
} from "./control/attempt-registry";

export {
  cancelPreviousConcurrencyPolicy,
  rejectIfBusyConcurrencyPolicy,
  queueIfBusyConcurrencyPolicy,
  type ConcurrencyPolicy,
  type ConcurrencyConflictContext,
  type ConcurrencyConflictDecision,
} from "./control/concurrency-policy";

export {
  createOsLease,
  type OsLease,
  type OsLeaseAcquireResult,
  type OsLeaseHolder,
  type OsLeaseScope,
} from "./control/os-lease";

export {
  createEscalationPort,
  createAutoEscalationPort,
  DEFAULT_PARK_TIMEOUT_MS,
  type EscalationPort,
  type EscalationPortMode,
  type EscalationOutcome,
  type EscalationRequest,
  type CreateEscalationPortDeps,
} from "./control/escalation-port";

export {
  createBudgetTracker,
  createBudgetGuard,
  formatBudgetExceededMessage,
  type BudgetTracker,
  type BudgetGuard,
  type BudgetDimension,
} from "./control/budget";

export {
  createRunController,
  type RunController,
  type RunConfig,
  type ProduceRun,
  type ProduceRunContext,
  type PermissionDecision,
  type RunControllerDeps,
} from "./control/run-controller";

export { deriveAttemptControls, type AttemptControls } from "./control/derive-attempt-controls";

export { deriveDisplayRows } from "./presentation/derive-display-rows";

export { isLiveWorkspaceReady } from "./live-workspace";

export { createDemoPayloads, createTestDemoProducer } from "./fixtures/demo-payloads";

// Demo/live producers are loaded via dynamic import inside createProduceRun —
// do not statically re-export them from this barrel (defeats cold-start splitting).
export { createProduceRun } from "./producers/select-producer";
