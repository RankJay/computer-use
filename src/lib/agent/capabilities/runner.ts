import type { DynamicToolUIPart } from "ai";

import { capabilityClassOf } from "@/lib/entitlements";
import { notifyIfUnfocused } from "@/lib/native/notification";
import type { RuntimeEventPayload } from "@/lib/session/events";

import { getCapabilityDefinition } from "./catalog";
import { createDefaultNativeInvoker, mapInvokeError } from "./native-invoke";
import { needsPermission } from "./permission";
import type {
  CapabilityError,
  CapabilityRunnerDeps,
  InvokeCapabilityResult,
  ToolPartLocation,
} from "./types";
import { uiToolLabel } from "./ui-labels";

function parseInputError(error: unknown): CapabilityError {
  if (error instanceof Error) {
    return { code: "invalid_input", message: error.message };
  }
  return { code: "invalid_input", message: "Capability input validation failed" };
}

function approvalPart(
  capability: string,
  callId: string,
  input: unknown,
  state: "approval-requested" | "approval-responded" | "output-denied",
  approved?: boolean,
): DynamicToolUIPart {
  if (state === "approval-requested") {
    return {
      type: "dynamic-tool",
      toolName: capability,
      toolCallId: callId,
      state: "approval-requested",
      input,
      approval: { id: callId },
    };
  }

  if (state === "output-denied") {
    return {
      type: "dynamic-tool",
      toolName: capability,
      toolCallId: callId,
      state: "output-denied",
      input,
      approval: { id: callId, approved: false },
    };
  }

  return {
    type: "dynamic-tool",
    toolName: capability,
    toolCallId: callId,
    state: "approval-responded",
    input,
    approval: { id: callId, approved: approved ?? true },
  };
}

function emitApprovalPart(
  deps: CapabilityRunnerDeps,
  location: ToolPartLocation | null | undefined,
  capability: string,
  callId: string,
  input: unknown,
  state: "approval-requested" | "approval-responded" | "output-denied",
  approved?: boolean,
): void {
  if (!location) return;
  deps.append({
    type: "assistant.part_updated",
    messageId: location.messageId,
    partIndex: location.partIndex,
    part: approvalPart(capability, callId, input, state, approved),
  });
}

/**
 * CapabilityRunner: validate → entitlement → permission gate → native invoke.
 * EntitlementPolicy is commercial; PermissionPolicy / waiter is OS safety — never conflated.
 */
export async function runCapability(
  name: string,
  rawInput: unknown,
  deps: CapabilityRunnerDeps,
  callId: string = crypto.randomUUID(),
): Promise<InvokeCapabilityResult> {
  const definition = getCapabilityDefinition(name);
  const append = (payload: RuntimeEventPayload) => {
    deps.append(payload);
  };

  append({
    type: "capability.requested",
    callId,
    capability: name,
    input: rawInput,
  });

  let parsedInput: unknown;
  try {
    parsedInput = definition.parseInput(rawInput);
  } catch (error) {
    const capabilityError = parseInputError(error);
    append({
      type: "capability.failed",
      callId,
      capability: name,
      error: capabilityError,
    });
    return { ok: false, error: capabilityError };
  }

  if (deps.entitlements) {
    const entitlement = await deps.entitlements.authorize({
      kind: "capability",
      capability: name,
      capabilityClass: capabilityClassOf(name),
    });

    if (entitlement.outcome === "deny" || entitlement.outcome === "require_upgrade") {
      append({
        type: "entitlement.denied",
        checkKind: "capability",
        outcome: entitlement.outcome,
        reason: entitlement.reason,
        feature: entitlement.outcome === "require_upgrade" ? entitlement.feature : undefined,
        capability: name,
      });
      const capabilityError: CapabilityError = {
        code:
          entitlement.outcome === "require_upgrade" ? "entitlement_upgrade" : "entitlement_denied",
        message: entitlement.reason,
      };
      append({
        type: "capability.failed",
        callId,
        capability: name,
        error: capabilityError,
      });
      return { ok: false, error: capabilityError };
    }

    if (entitlement.outcome === "allow_and_meter") {
      append({
        type: "entitlement.metered",
        meterKey: entitlement.meterKey,
        amount: entitlement.amount,
        newValue: entitlement.newValue,
        checkKind: "capability",
        capability: name,
      });
    }
  }

  const resolveLocation = () => deps.resolveToolPart?.(callId) ?? null;

  if (needsPermission(definition, deps.settings)) {
    append({
      type: "permission.requested",
      callId,
      capability: name,
      input: parsedInput,
      risk: definition.risk,
    });
    emitApprovalPart(deps, resolveLocation(), name, callId, parsedInput, "approval-requested");
    notifyIfUnfocused({
      title: "Approval needed",
      body: `${uiToolLabel(name)} is waiting. Hop back in to approve or reject.`,
    });

    const waiter = deps.createPermissionWaiter(callId);
    const decision = await waiter.waitForDecision();

    append({
      type: "permission.resolved",
      callId,
      decision,
    });

    // Re-resolve after the waiter — the tool part may have arrived mid-wait.
    if (decision === "denied") {
      emitApprovalPart(deps, resolveLocation(), name, callId, parsedInput, "output-denied", false);
      return { ok: false, denied: true };
    }

    emitApprovalPart(
      deps,
      resolveLocation(),
      name,
      callId,
      parsedInput,
      "approval-responded",
      true,
    );
  }

  const invokeNative = deps.invokeNative ?? createDefaultNativeInvoker();

  try {
    const output = await invokeNative(name, parsedInput, deps.workspaceRoot);
    append({
      type: "capability.completed",
      callId,
      capability: name,
      output,
    });
    return { ok: true, output };
  } catch (error) {
    const capabilityError = mapInvokeError(error);
    append({
      type: "capability.failed",
      callId,
      capability: name,
      error: capabilityError,
    });
    return { ok: false, error: capabilityError };
  }
}
