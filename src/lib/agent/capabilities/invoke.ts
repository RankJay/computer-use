import type { RuntimeEvent, RuntimeEventPayload } from "@/lib/session/events";

import { needsPermission } from "./permission";
import { getCapabilityDefinition } from "./catalog";
import { mapInvokeError } from "./tauri-invoke";
import type {
  CapabilityContext,
  CapabilityError,
  InvokeCapabilityDeps,
  InvokeCapabilityResult,
} from "./types";

function createEvent(
  deps: InvokeCapabilityDeps,
  callId: string,
  payload: RuntimeEventPayload,
): RuntimeEvent {
  return {
    ...payload,
    eventId: `${deps.taskId}-${callId}-${payload.type}`,
    taskId: deps.taskId,
    timestamp: Date.now(),
  } as RuntimeEvent;
}

function parseInputError(error: unknown): CapabilityError {
  if (error instanceof Error) {
    return { code: "invalid_input", message: error.message };
  }
  return { code: "invalid_input", message: "Capability input validation failed" };
}

export async function invokeCapability(
  name: string,
  rawInput: unknown,
  deps: InvokeCapabilityDeps,
  callId: string = crypto.randomUUID(),
): Promise<InvokeCapabilityResult> {
  const definition = getCapabilityDefinition(name);

  deps.emit(
    createEvent(deps, callId, {
      type: "capability.requested",
      callId,
      capability: name,
      input: rawInput,
    }),
  );

  let parsedInput: unknown;
  try {
    parsedInput = definition.parseInput(rawInput);
  } catch (error) {
    const capabilityError = parseInputError(error);
    deps.emit(
      createEvent(deps, callId, {
        type: "capability.failed",
        callId,
        capability: name,
        error: capabilityError,
      }),
    );
    return { ok: false, error: capabilityError };
  }

  if (needsPermission(definition, deps.settings)) {
    deps.emit(
      createEvent(deps, callId, {
        type: "permission.requested",
        callId,
        capability: name,
        input: parsedInput,
        risk: definition.risk,
      }),
    );

    const waiter = deps.createPermissionWaiter?.({
      callId,
      capability: name,
      input: parsedInput,
      risk: definition.risk,
    });

    if (!waiter) {
      return { ok: false, denied: true };
    }

    const decision = await waiter.waitForDecision();

    deps.emit(
      createEvent(deps, callId, {
        type: "permission.resolved",
        callId,
        decision,
      }),
    );

    if (decision === "denied") {
      return { ok: false, denied: true };
    }
  }

  const context: CapabilityContext = {
    workspaceRoot: deps.workspaceRoot,
    settings: deps.settings,
    emit: deps.emit,
    callId,
    taskId: deps.taskId,
  };

  try {
    const output = deps.executeNative
      ? await deps.executeNative(name, parsedInput)
      : await definition.execute(parsedInput, context);

    deps.emit(
      createEvent(deps, callId, {
        type: "capability.completed",
        callId,
        capability: name,
        output,
      }),
    );

    return { ok: true, output };
  } catch (error) {
    const capabilityError = mapInvokeError(error);
    deps.emit(
      createEvent(deps, callId, {
        type: "capability.failed",
        callId,
        capability: name,
        error: capabilityError,
      }),
    );
    return { ok: false, error: capabilityError };
  }
}
