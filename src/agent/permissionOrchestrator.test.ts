import { describe, expect, test } from "bun:test";
import {
  PermissionResolverLifecycle,
  requestToolPermission,
  type PermissionOrchestrationContext,
} from "@/agent/permissionOrchestrator";
import {
  AGENT_TOOL_NAMES,
  type AgentToolName,
  type ConsequenceRiskClass,
} from "@/agent/toolContract";
import type { AgentEvent, PermissionChoice, PermissionMode } from "@/agent/types";

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
};

type Harness = {
  readonly events: AgentEvent[];
  readonly loggedEvents: AgentEvent[];
  readonly persistedTools: AgentToolName[];
  readonly sessionRiskApproved: Set<ConsequenceRiskClass>;
  readonly deferred: Deferred<PermissionChoice>;
  readonly context: PermissionOrchestrationContext;
  readonly requestedPermissionId: string | null;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

async function flushPermissionWaiter(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createHarness(mode: PermissionMode): Harness {
  const events: AgentEvent[] = [];
  const loggedEvents: AgentEvent[] = [];
  const persistedTools: AgentToolName[] = [];
  const sessionRiskApproved = new Set<ConsequenceRiskClass>();
  const deferred = createDeferred<PermissionChoice>();
  let requestedPermissionId: string | null = null;

  return {
    events,
    loggedEvents,
    persistedTools,
    sessionRiskApproved,
    deferred,
    get requestedPermissionId() {
      return requestedPermissionId;
    },
    context: {
      taskId: "task-1",
      permissionMode: mode,
      uiAutomationEnabled: true,
      persistedToolApprovals: new Set(),
      sessionRiskApproved,
      emit: (event) => {
        events.push(event);
      },
      waitForPermission: (permissionId) => {
        requestedPermissionId = permissionId;
        return deferred.promise;
      },
      persistAlwaysAllow: async (toolName) => {
        persistedTools.push(toolName);
      },
      appendStructuredLog: async (event) => {
        loggedEvents.push(event);
      },
    },
  };
}

describe("permissionOrchestrator", () => {
  test("ask_risky skips prompt for observe tools", async () => {
    const harness = createHarness("ask_risky");

    const permitted = await requestToolPermission(
      harness.context,
      AGENT_TOOL_NAMES.DISPLAY_CAPTURE,
      {
        summary: "Capture screen",
        rationale: "Observe UI",
        details: "primary display",
      },
    );

    expect(permitted).toBe(true);
    expect(harness.events).toEqual([]);
    expect(harness.requestedPermissionId).toBeNull();
  });

  test("ask_all prompts for observe tools", async () => {
    const harness = createHarness("ask_all");
    const permittedPromise = requestToolPermission(harness.context, AGENT_TOOL_NAMES.FILE_READ, {
      summary: "Read package.json",
      rationale: "Inspect dependencies",
      details: "package.json",
    });

    await flushPermissionWaiter();
    expect(harness.requestedPermissionId).not.toBeNull();
    expect(harness.events[0]?.type).toBe("permission.requested");

    harness.deferred.resolve("allow_once");
    await expect(permittedPromise).resolves.toBe(true);
    expect(harness.events[1]?.type).toBe("permission.resolved");
  });

  test("session_low_risk does not leave a pending prompt", async () => {
    const harness = createHarness("session_low_risk");

    const permitted = await requestToolPermission(harness.context, AGENT_TOOL_NAMES.TERMINAL_RUN, {
      summary: "Run bun test",
      rationale: "Verify changes",
      details: "bun test src",
    });

    expect(permitted).toBe(true);
    expect(harness.events).toEqual([]);
    expect(harness.requestedPermissionId).toBeNull();
  });

  test("deny returns a denied result", async () => {
    const harness = createHarness("ask_all");
    const permittedPromise = requestToolPermission(harness.context, AGENT_TOOL_NAMES.TERMINAL_RUN, {
      summary: "Run command",
      rationale: "Execute locally",
      details: "bun test",
    });

    await flushPermissionWaiter();
    harness.deferred.resolve("deny");

    await expect(permittedPromise).resolves.toBe(false);
  });

  test("allow_session approves the risk class for the rest of the session", async () => {
    const harness = createHarness("ask_all");
    const permittedPromise = requestToolPermission(harness.context, AGENT_TOOL_NAMES.TERMINAL_RUN, {
      summary: "Run command",
      rationale: "Execute locally",
      details: "bun test",
    });

    await flushPermissionWaiter();
    harness.deferred.resolve("allow_session");

    await expect(permittedPromise).resolves.toBe(true);
    expect(harness.sessionRiskApproved.has("execute_local")).toBe(true);

    harness.events.length = 0;
    const nextPermitted = await requestToolPermission(
      harness.context,
      AGENT_TOOL_NAMES.TERMINAL_RUN,
      {
        summary: "Run command again",
        rationale: "Same risk class",
        details: "bun build",
      },
    );

    expect(nextPermitted).toBe(true);
    expect(harness.events).toEqual([]);
  });

  test("allow_always persists once", async () => {
    const harness = createHarness("ask_all");
    const permittedPromise = requestToolPermission(harness.context, AGENT_TOOL_NAMES.FILE_WRITE, {
      summary: "Write file",
      rationale: "Modify workspace",
      details: "src/example.ts",
    });

    await flushPermissionWaiter();
    harness.deferred.resolve("allow_always");

    await expect(permittedPromise).resolves.toBe(true);
    expect(harness.persistedTools).toEqual([AGENT_TOOL_NAMES.FILE_WRITE]);
  });

  test("resolver lifecycle resolves and cancels outstanding permissions", async () => {
    const lifecycle = new PermissionResolverLifecycle();
    const first = lifecycle.waitForChoice("permission-1");

    expect(lifecycle.pendingCount).toBe(1);
    expect(lifecycle.resolve("permission-1", "allow_once")).toBe(true);
    await expect(first).resolves.toBe("allow_once");
    expect(lifecycle.pendingCount).toBe(0);

    const second = lifecycle.waitForChoice("permission-2");
    lifecycle.cancelAll();

    await expect(second).resolves.toBe("deny");
    expect(lifecycle.pendingCount).toBe(0);
  });
});
