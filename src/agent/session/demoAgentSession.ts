import type { AgentNativeBridge } from "@/agent/native/nativeBridge";
import { requestToolPermission } from "@/agent/permissions/permissionOrchestrator";
import { buildTaskCancelledEvent } from "@/agent/session/liveTaskEvents";
import type { AgentSessionRunnerOptions } from "@/agent/session/sessionRunner";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import {
  abortable,
  isCancellationError,
  TOOL_CANCELLED_REASON,
  ToolCancelledError,
  throwIfAborted,
} from "@/agent/tools/toolCancellation";
import { createEventId, type EmitFn } from "@/agent/types";

export type DemoAgentSessionOptions = AgentSessionRunnerOptions;

function createMeta(): { readonly id: string; readonly at: number } {
  return { id: createEventId(), at: Date.now() };
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof globalThis.setTimeout>;
    const abortListener = () => {
      globalThis.clearTimeout(timeoutId);
      signal.removeEventListener("abort", abortListener);
      reject(new ToolCancelledError());
    };
    timeoutId = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", abortListener);
      resolve();
    }, ms);
    signal.addEventListener("abort", abortListener, { once: true });
  });
}

function trimOutput(text: string, max = 280): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

async function streamText(
  taskId: string,
  emit: EmitFn,
  text: string,
  chunkMs: number,
  signal: AbortSignal,
): Promise<void> {
  const words = text.split(" ");
  for (const word of words) {
    throwIfAborted(signal);
    emit({
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "assistant.text.delta",
      text: `${word} `,
    });
    // eslint-disable-next-line no-await-in-loop -- Preserve the demo stream cadence between emitted words.
    await delay(chunkMs, signal);
  }

  throwIfAborted(signal);
  emit({
    id: createEventId(),
    at: Date.now(),
    taskId,
    type: "assistant.text.done",
  });
}

function workspaceDetails(workspaceRoot: string | null, native: AgentNativeBridge | null): string {
  const cwd =
    workspaceRoot && workspaceRoot.trim().length > 0
      ? workspaceRoot.trim()
      : "(default / current process cwd)";
  const mode = native
    ? "Tauri: real process execution after approval"
    : "Browser: simulated tools only";
  return `Command: bun install\nWorking directory: ${cwd}\nMode: ${mode}\nNetwork: required for install`;
}

export async function runDemoAgentSession(options: DemoAgentSessionOptions): Promise<void> {
  const {
    taskId,
    prompt,
    emit,
    waitForPermissionChoice,
    permissionMode,
    workspaceRoot,
    abortSignal,
    native,
  } = options;

  emit({
    id: createEventId(),
    at: Date.now(),
    taskId,
    type: "task.created",
    prompt,
  });

  try {
    await delay(120, abortSignal);

    const intro =
      native === null
        ? "Here is a short plan before I touch your machine. Running in the browser: desktop tools are simulated."
        : "Here is a short plan before I touch your machine. Running in Tauri: screenshots and terminal calls use native commands after you approve risky work.";

    await streamText(taskId, emit, intro, 35, abortSignal);

    await delay(160, abortSignal);

    throwIfAborted(abortSignal);
    emit({
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "plan.updated",
      steps: [
        "Inspect workspace (screenshot + quick command probe when native)",
        "Run bun install after explicit approval",
        "Summarize results",
      ],
    });

    await delay(220, abortSignal);

    throwIfAborted(abortSignal);
    emit({
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "step.started",
      stepIndex: 0,
      title: "Inspect workspace",
    });

    await delay(200, abortSignal);

    let screenshotB64: string | undefined;
    if (native) {
      try {
        screenshotB64 = await abortable(abortSignal, native.capturePrimaryDisplayPngBase64());
      } catch (err) {
        if (abortSignal.aborted || isCancellationError(err)) {
          throw err;
        }
        screenshotB64 = undefined;
      }
    }

    throwIfAborted(abortSignal);
    emit({
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "screenshot.keyframe",
      label: "Primary display (keyframe)",
      ...(screenshotB64 ? { imageBase64: screenshotB64 } : {}),
    });

    await delay(220, abortSignal);

    throwIfAborted(abortSignal);
    emit({
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "tool.started",
      toolName: AGENT_TOOL_NAMES.WORKSPACE_INSPECT,
      inputSummary: native ? "bun --version" : "actuate/ (simulated)",
    });

    if (native) {
      const cwd = workspaceRoot && workspaceRoot.trim().length > 0 ? workspaceRoot.trim() : null;
      try {
        const probe = await abortable(
          abortSignal,
          native.runCommand({ program: "bun", args: ["--version"], cwd }),
        );
        const summary =
          probe.code === 0
            ? `bun detected: ${trimOutput(probe.stdout || probe.stderr)}`
            : `bun probe failed (exit ${probe.code}): ${trimOutput(probe.stderr || probe.stdout)}`;
        throwIfAborted(abortSignal);
        emit({
          id: createEventId(),
          at: Date.now(),
          taskId,
          type: "tool.completed",
          toolName: AGENT_TOOL_NAMES.WORKSPACE_INSPECT,
          outputSummary: summary,
        });
      } catch (err) {
        if (abortSignal.aborted || isCancellationError(err)) {
          throw err;
        }
        const message = err instanceof Error ? err.message : String(err);
        throwIfAborted(abortSignal);
        emit({
          id: createEventId(),
          at: Date.now(),
          taskId,
          type: "tool.completed",
          toolName: AGENT_TOOL_NAMES.WORKSPACE_INSPECT,
          outputSummary: `Probe error: ${message}`,
        });
      }
    } else {
      await delay(280, abortSignal);
      throwIfAborted(abortSignal);
      emit({
        id: createEventId(),
        at: Date.now(),
        taskId,
        type: "tool.completed",
        toolName: AGENT_TOOL_NAMES.WORKSPACE_INSPECT,
        outputSummary: "Simulated: found a Vite + Tauri React app",
      });
    }

    await delay(180, abortSignal);

    throwIfAborted(abortSignal);
    emit({
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "step.completed",
      stepIndex: 0,
    });

    await delay(160, abortSignal);

    throwIfAborted(abortSignal);
    emit({
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "step.started",
      stepIndex: 1,
      title: "Install dependencies (approved)",
    });

    const permitted = await requestToolPermission(
      {
        taskId,
        permissionMode,
        uiAutomationEnabled: true,
        persistedToolApprovals: new Set(),
        sessionRiskApproved: new Set(),
        emit,
        waitForPermission: (permissionId) =>
          abortable(abortSignal, waitForPermissionChoice(permissionId)),
        persistAlwaysAllow: async () => {},
        appendStructuredLog: async () => {},
      },
      AGENT_TOOL_NAMES.TERMINAL_RUN,
      {
        summary: "Run bun install for the selected workspace",
        rationale: "Install dependencies so the repo is ready for real commands in future steps.",
        details: workspaceDetails(workspaceRoot, native),
      },
    );

    throwIfAborted(abortSignal);
    if (!permitted) {
      emit({
        id: createEventId(),
        at: Date.now(),
        taskId,
        type: "task.completed",
        summary:
          "Stopped before bun install because permission was denied. Adjust workspace path or permission mode and try again.",
      });
      return;
    }

    await delay(200, abortSignal);

    throwIfAborted(abortSignal);
    emit({
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "tool.started",
      toolName: AGENT_TOOL_NAMES.TERMINAL_RUN,
      inputSummary: "bun install",
    });

    if (native) {
      const cwd = workspaceRoot && workspaceRoot.trim().length > 0 ? workspaceRoot.trim() : null;
      try {
        const result = await abortable(
          abortSignal,
          native.runCommand({ program: "bun", args: ["install"], cwd }),
        );
        const summary =
          result.code === 0
            ? `bun install finished (exit 0). ${trimOutput(result.stdout || result.stderr)}`
            : `bun install failed (exit ${result.code}). ${trimOutput(result.stderr || result.stdout)}`;
        throwIfAborted(abortSignal);
        emit({
          id: createEventId(),
          at: Date.now(),
          taskId,
          type: "tool.completed",
          toolName: AGENT_TOOL_NAMES.TERMINAL_RUN,
          outputSummary: summary,
        });
      } catch (err) {
        if (abortSignal.aborted || isCancellationError(err)) {
          throw err;
        }
        const message = err instanceof Error ? err.message : String(err);
        throwIfAborted(abortSignal);
        emit({
          id: createEventId(),
          at: Date.now(),
          taskId,
          type: "tool.completed",
          toolName: AGENT_TOOL_NAMES.TERMINAL_RUN,
          outputSummary: `Run error: ${message}`,
        });
      }
    } else {
      await delay(420, abortSignal);
      throwIfAborted(abortSignal);
      emit({
        id: createEventId(),
        at: Date.now(),
        taskId,
        type: "tool.completed",
        toolName: AGENT_TOOL_NAMES.TERMINAL_RUN,
        outputSummary: "Simulated success: dependencies installed",
      });
    }

    await delay(200, abortSignal);

    throwIfAborted(abortSignal);
    emit({
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "step.completed",
      stepIndex: 1,
    });

    await delay(160, abortSignal);

    throwIfAborted(abortSignal);
    emit({
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "step.started",
      stepIndex: 2,
      title: "Summarize",
    });

    await delay(220, abortSignal);

    throwIfAborted(abortSignal);
    emit({
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "task.completed",
      summary:
        native === null
          ? "Demo finished in the browser. Open the Tauri app to run real screenshots and bun install behind approvals."
          : "Demo finished with native tools. Next: route model-driven steps through the same bridge, and tighten cwd validation + capability policies.",
    });
  } catch (err) {
    if (abortSignal.aborted || isCancellationError(err)) {
      emit(buildTaskCancelledEvent(taskId, TOOL_CANCELLED_REASON, createMeta()));
      return;
    }
    throw err;
  }
}
