import { describe, expect, test } from "bun:test";

import type { Mandate } from "@/lib/mandates";
import {
  cancelPreviousConcurrencyPolicy,
  queueIfBusyConcurrencyPolicy,
} from "@/lib/session/control/concurrency-policy";

import { evaluateTriggerWake, triggerSuppressedFact } from "./evaluate-wake";

function mandate(status: Mandate["status"]): Mandate {
  return {
    id: "m1",
    createdAt: 1,
    kind: "interactive",
    status,
    parentMandateId: null,
    standingPolicy: null,
  };
}

describe("evaluateTriggerWake", () => {
  test("suppresses when Mandate already running", () => {
    expect(
      evaluateTriggerWake({
        mandate: mandate("running"),
        live: { mandateId: "m1", attemptId: "a1" },
      }),
    ).toEqual({ action: "suppress", reason: "mandate_running" });
  });

  test("suppresses when waiting_permission", () => {
    expect(
      evaluateTriggerWake({
        mandate: mandate("waiting_permission"),
        live: null,
      }),
    ).toEqual({ action: "suppress", reason: "waiting_permission" });
  });

  test("armed + idle live → start", () => {
    expect(
      evaluateTriggerWake({
        mandate: mandate("armed"),
        live: null,
      }),
    ).toEqual({
      action: "start",
      reason: "ok",
      concurrency: "cancel_previous",
    });
  });

  test("rejectIfBusy suppresses when another Mandate is live", () => {
    expect(
      evaluateTriggerWake({
        mandate: mandate("armed"),
        live: { mandateId: "other", attemptId: "a9" },
      }),
    ).toEqual({
      action: "suppress",
      reason: "concurrency_reject",
      concurrency: "reject",
    });
  });

  test("queue policy names queue without starting", () => {
    expect(
      evaluateTriggerWake({
        mandate: mandate("armed"),
        live: { mandateId: "other", attemptId: "a9" },
        concurrencyPolicy: queueIfBusyConcurrencyPolicy,
      }),
    ).toEqual({
      action: "queue",
      reason: "concurrency_queue",
      concurrency: "queue",
    });
  });

  test("cancel_previous policy may start even if busy (interactive-style)", () => {
    expect(
      evaluateTriggerWake({
        mandate: mandate("armed"),
        live: { mandateId: "other", attemptId: "a9" },
        concurrencyPolicy: cancelPreviousConcurrencyPolicy,
      }),
    ).toEqual({
      action: "start",
      reason: "ok",
      concurrency: "cancel_previous",
    });
  });

  test("triggerSuppressedFact shape", () => {
    expect(
      triggerSuppressedFact({
        mandateId: "m1",
        reason: "mandate_running",
        triggerId: "cron-1",
      }),
    ).toEqual({
      type: "trigger.suppressed",
      mandateId: "m1",
      reason: "mandate_running",
      triggerId: "cron-1",
    });
  });
});
