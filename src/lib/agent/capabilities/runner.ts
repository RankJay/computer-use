import type { DynamicToolUIPart } from "ai";

import { capabilityClassOf } from "@/lib/entitlements";
import type { RuntimeEventPayload } from "@/lib/session/events";

import { getCapabilityDefinition } from "./catalog";
import { createDefaultNativeInvoker, mapInvokeError } from "./native-invoke";
import { osLeaseScopeOf } from "./os-lease-scope";
import { defaultPermissionPolicy } from "./permission-policy";
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
 * CapabilityRunner: validate → entitlement → PermissionPolicy → EscalationPort → OS lease → invoke.
 * Policy never notifies; EscalationPort owns wait/park/timeout.
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
  const policy = deps.permissionPolicy ?? defaultPermissionPolicy;
  const policyDecision = policy.resolve({
    name: definition.name,
    risk: definition.risk,
    destructive: definition.destructive,
    settings: deps.settings,
  });

  if (policyDecision === "deny") {
    append({
      type: "permission.requested",
      callId,
      capability: name,
      input: parsedInput,
      risk: definition.risk,
    });
    append({
      type: "permission.resolved",
      callId,
      decision: "denied",
    });
    emitApprovalPart(deps, resolveLocation(), name, callId, parsedInput, "output-denied", false);
    return { ok: false, denied: true };
  }

  if (policyDecision === "escalate") {
    if (!deps.escalationPort) {
      const capabilityError: CapabilityError = {
        code: "escalation_port_missing",
        message: "EscalationPort required when PermissionPolicy returns escalate.",
      };
      append({
        type: "capability.failed",
        callId,
        capability: name,
        error: capabilityError,
      });
      return { ok: false, error: capabilityError };
    }

    append({
      type: "permission.requested",
      callId,
      capability: name,
      input: parsedInput,
      risk: definition.risk,
    });
    emitApprovalPart(deps, resolveLocation(), name, callId, parsedInput, "approval-requested");

    const outcome = await deps.escalationPort.escalate({
      callId,
      attemptId: deps.taskId,
      capability: name,
      label: uiToolLabel(name),
      input: parsedInput,
      risk: definition.risk,
    });

    append({
      type: "permission.resolved",
      callId,
      decision: outcome === "allow" ? "approved" : "denied",
    });

    if (outcome === "deny") {
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

  const leaseScope = osLeaseScopeOf(name);
  if (leaseScope !== "none" && deps.osLease) {
    const lease = deps.osLease.acquire(deps.taskId, leaseScope);
    if (lease.outcome === "rejected") {
      const capabilityError: CapabilityError = {
        code: "os_lease_held",
        message: `Desktop OS lease held by another Attempt (${lease.holderAttemptId}).`,
      };
      append({
        type: "capability.failed",
        callId,
        capability: name,
        error: capabilityError,
      });
      return { ok: false, error: capabilityError };
    }
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
