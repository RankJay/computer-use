import type { DynamicToolUIPart } from "ai";

import { capabilityClassOf } from "@/lib/entitlements";
import { escalationToPermissionDecision } from "@/lib/session/control/escalation-port";
import { osLeaseScopeOf } from "@/lib/session/control/os-lease-scope";
import type { RuntimeEventPayload } from "@/lib/session/events";

import { getCapabilityDefinition } from "./catalog";
import { createDefaultNativeInvoker, mapInvokeError } from "./native-invoke";
import { defaultPermissionPolicy } from "./permission-policy";
import { lookupSettledCapability } from "./resume-from-cursor";
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

  // Resume-from-cursor: settled callId → prior outcome, no re-click.
  const prior = deps.getEventLog ? lookupSettledCapability(deps.getEventLog(), callId) : null;
  if (prior) {
    return prior;
  }

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

  const entitlementCheck = {
    kind: "capability" as const,
    capability: name,
    capabilityClass: capabilityClassOf(name),
  };

  // Dry-run commercial gate first — do not burn meters on deny/timeout/lease reject.
  if (deps.entitlements) {
    const entitlement = await deps.entitlements.authorize(entitlementCheck, { commit: false });

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
  }

  const resolveLocation = () => deps.resolveToolPart?.(callId) ?? null;
  const policy = deps.permissionPolicy ?? defaultPermissionPolicy;
  const policyDecision = policy.resolve({
    name: definition.name,
    risk: definition.risk,
    destructive: definition.destructive,
    settings: deps.settings,
    standingPolicy: deps.standingPolicy,
  });

  if (policyDecision === "deny") {
    append({
      type: "interaction.requested",
      callId,
      kind: "permission",
      permission: {
        capability: name,
        input: parsedInput,
        risk: definition.risk,
      },
    });
    append({
      type: "interaction.resolved",
      callId,
      kind: "permission",
      permission: {
        decision: "denied",
      },
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
      type: "interaction.requested",
      callId,
      kind: "permission",
      permission: {
        capability: name,
        input: parsedInput,
        risk: definition.risk,
      },
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
      type: "interaction.resolved",
      callId,
      kind: "permission",
      permission: {
        decision: escalationToPermissionDecision(outcome),
      },
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

  // Commit meters only once the call is allowed to invoke.
  if (deps.entitlements) {
    const committed = await deps.entitlements.authorize(entitlementCheck, { commit: true });
    if (committed.outcome === "deny" || committed.outcome === "require_upgrade") {
      append({
        type: "entitlement.denied",
        checkKind: "capability",
        outcome: committed.outcome,
        reason: committed.reason,
        feature: committed.outcome === "require_upgrade" ? committed.feature : undefined,
        capability: name,
      });
      const capabilityError: CapabilityError = {
        code:
          committed.outcome === "require_upgrade" ? "entitlement_upgrade" : "entitlement_denied",
        message: committed.reason,
      };
      append({
        type: "capability.failed",
        callId,
        capability: name,
        error: capabilityError,
      });
      return { ok: false, error: capabilityError };
    }
    if (committed.outcome === "allow_and_meter") {
      append({
        type: "entitlement.metered",
        meterKey: committed.meterKey,
        amount: committed.amount,
        newValue: committed.newValue,
        checkKind: "capability",
        capability: name,
      });
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
