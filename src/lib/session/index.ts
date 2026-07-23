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
  SessionProjection,
  SessionFailure,
  SessionUsage,
  SessionBudget,
  PendingPermission,
} from "./projection";
export {
  createEmptySessionProjection,
  EMPTY_PENDING_PERMISSIONS,
  EMPTY_SESSION_BUDGET,
  EMPTY_SESSION_USAGE,
} from "./projection";

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

export {
  setActiveSessionEngine,
  getActiveSessionEngine,
  getAttemptHost,
  registerAttemptHost,
  resetActiveSessionEngine,
} from "./active-engine";

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
  type PermissionWaiter,
  type RunControllerDeps,
} from "./control/run-controller";

export { deriveSessionControls, type SessionControls } from "./control/derive-session-controls";

export { deriveDisplayRows } from "./presentation/derive-display-rows";

export { isLiveWorkspaceReady } from "./live-workspace";

export { createDemoPayloads, createTestDemoProducer } from "./fixtures/demo-payloads";

// Demo/live producers are loaded via dynamic import inside createProduceRun —
// do not statically re-export them from this barrel (defeats cold-start splitting).
export { createProduceRun } from "./producers/select-producer";
