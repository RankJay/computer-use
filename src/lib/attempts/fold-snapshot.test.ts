import { describe, expect, test } from "bun:test";

import { createEmptyMandateProjection } from "@/lib/session/projection";

import {
  isAttemptFoldSnapshot,
  parseAttemptFoldSnapshot,
  projectionToFoldSnapshot,
} from "./fold-snapshot";

describe("attempt fold snapshot Zod boundary", () => {
  test("accepts projectionToFoldSnapshot output", () => {
    const snap = projectionToFoldSnapshot({
      ...createEmptyMandateProjection(),
      attemptId: "att-1",
      status: "completed",
    });
    expect(isAttemptFoldSnapshot(snap)).toBe(true);
    expect(parseAttemptFoldSnapshot(snap)?.attemptId).toBe("att-1");
    expect(parseAttemptFoldSnapshot(snap)?.status).toBe("completed");
  });

  test("rejects wrong version", () => {
    const snap = projectionToFoldSnapshot(createEmptyMandateProjection());
    expect(parseAttemptFoldSnapshot({ ...snap, version: 99 })).toBeNull();
  });

  test("rejects missing budget skeleton", () => {
    const snap = projectionToFoldSnapshot(createEmptyMandateProjection());
    const { budget: _budget, ...rest } = snap;
    expect(parseAttemptFoldSnapshot(rest)).toBeNull();
  });

  test("rejects invalid RunStatus", () => {
    const snap = projectionToFoldSnapshot(createEmptyMandateProjection());
    expect(parseAttemptFoldSnapshot({ ...snap, status: "bogus" })).toBeNull();
  });

  test("rejects invalid CapabilityRisk on pending permission", () => {
    const snap = projectionToFoldSnapshot({
      ...createEmptyMandateProjection(),
      pendingInteractions: [
        {
          callId: "c1",
          kind: "permission",
          permission: {
            capability: "shell_run",
            input: {},
            risk: "medium",
          },
        },
      ],
    });
    expect(
      parseAttemptFoldSnapshot({
        ...snap,
        pendingInteractions: [
          {
            callId: "c1",
            kind: "permission",
            permission: {
              capability: "shell_run",
              input: {},
              risk: "critical",
            },
          },
        ],
      }),
    ).toBeNull();
  });

  test("rejects transcript row without known type", () => {
    const snap = projectionToFoldSnapshot(createEmptyMandateProjection());
    expect(
      parseAttemptFoldSnapshot({
        ...snap,
        rows: [{ id: "x", text: "no type" }],
      }),
    ).toBeNull();
  });
});
