import { describe, expect, test } from "bun:test";

import type { RunStatus } from "../events";
import { createEmptyMandateProjection, type MandateProjection } from "../projection";
import { deriveSessionControls } from "./derive-session-controls";

function projection(partial: Partial<MandateProjection>): MandateProjection {
  return { ...createEmptyMandateProjection(), ...partial };
}

const ACTIVE: RunStatus[] = ["running", "streaming", "waiting_permission"];
const INACTIVE: RunStatus[] = ["idle", "completed", "failed", "cancelled"];

describe("deriveSessionControls", () => {
  for (const status of ACTIVE) {
    test(`${status}: active flags`, () => {
      const controls = deriveSessionControls(projection({ status }));
      expect(controls.canSubmit).toBe(false);
      expect(controls.canCancel).toBe(true);
      expect(controls.cancelVisible).toBe(true);
      expect(controls.inputDisabled).toBe(true);
    });
  }

  for (const status of INACTIVE) {
    test(`${status}: inactive flags`, () => {
      const controls = deriveSessionControls(projection({ status }));
      expect(controls.canSubmit).toBe(true);
      expect(controls.canCancel).toBe(false);
      expect(controls.cancelVisible).toBe(false);
      expect(controls.inputDisabled).toBe(false);
    });
  }

  test("canRetry only when failed and recoverable", () => {
    expect(
      deriveSessionControls(
        projection({
          status: "failed",
          failure: { code: "auth", message: "missing key", recoverable: true },
        }),
      ).canRetry,
    ).toBe(true);

    expect(
      deriveSessionControls(
        projection({
          status: "failed",
          failure: { code: "internal", message: "boom", recoverable: false },
        }),
      ).canRetry,
    ).toBe(false);

    expect(deriveSessionControls(projection({ status: "completed" })).canRetry).toBe(false);
  });

  test("canResolvePermission when pendingPermissions non-empty", () => {
    expect(deriveSessionControls(projection({ pendingPermissions: [] })).canResolvePermission).toBe(
      false,
    );

    expect(
      deriveSessionControls(
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
