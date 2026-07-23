import { describe, expect, test } from "bun:test";

import type { RunStatus } from "../events";
import { createEmptyMandateProjection, type MandateProjection } from "../projection";
import { deriveAttemptControls } from "./derive-attempt-controls";

function projection(partial: Partial<MandateProjection>): MandateProjection {
  return { ...createEmptyMandateProjection(), ...partial };
}

const ACTIVE: RunStatus[] = ["running", "streaming", "waiting_permission"];
const INACTIVE: RunStatus[] = ["idle", "completed", "failed", "cancelled"];

describe("deriveAttemptControls", () => {
  for (const status of ACTIVE) {
    test(`${status}: active flags`, () => {
      const controls = deriveAttemptControls(projection({ status }));
      expect(controls.canSubmit).toBe(false);
      expect(controls.canCancel).toBe(true);
      expect(controls.cancelVisible).toBe(true);
      expect(controls.inputDisabled).toBe(true);
    });
  }

  for (const status of INACTIVE) {
    test(`${status}: inactive flags`, () => {
      const controls = deriveAttemptControls(projection({ status }));
      expect(controls.canSubmit).toBe(true);
      expect(controls.canCancel).toBe(false);
      expect(controls.cancelVisible).toBe(false);
      expect(controls.inputDisabled).toBe(false);
    });
  }

  test("canRetry only when failed and recoverable", () => {
    expect(
      deriveAttemptControls(
        projection({
          status: "failed",
          failure: { code: "auth", message: "missing key", recoverable: true },
        }),
      ).canRetry,
    ).toBe(true);

    expect(
      deriveAttemptControls(
        projection({
          status: "failed",
          failure: { code: "internal", message: "boom", recoverable: false },
        }),
      ).canRetry,
    ).toBe(false);

    expect(deriveAttemptControls(projection({ status: "completed" })).canRetry).toBe(false);
  });

  test("canResolvePermission when pendingPermissions non-empty", () => {
    expect(deriveAttemptControls(projection({ pendingPermissions: [] })).canResolvePermission).toBe(
      false,
    );

    expect(
      deriveAttemptControls(
        projection({
          status: "waiting_permission",
          pendingPermissions: [
            {
              callId: "c1",
              capability: "write_file",
              input: {},
              risk: "high",
            },
          ],
        }),
      ).canResolvePermission,
    ).toBe(true);
  });
});
