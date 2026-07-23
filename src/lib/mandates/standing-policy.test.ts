import { describe, expect, test } from "bun:test";

import { applyStandingPolicyOverlay } from "./standing-policy";
import type { StandingPolicyDocument } from "./types";

describe("applyStandingPolicyOverlay", () => {
  test("null / empty document leaves base decision", () => {
    expect(applyStandingPolicyOverlay("escalate", "delete_path", null)).toBe("escalate");
    expect(applyStandingPolicyOverlay("allow", "read_file", undefined)).toBe("allow");
    expect(applyStandingPolicyOverlay("escalate", "delete_path", { version: 1 })).toBe("escalate");
  });

  test("allowCapabilities short-circuits to allow", () => {
    const doc: StandingPolicyDocument = {
      version: 1,
      allowCapabilities: ["delete_path"],
    };
    expect(applyStandingPolicyOverlay("escalate", "delete_path", doc)).toBe("allow");
  });

  test("denyCapabilities short-circuits to deny", () => {
    const doc: StandingPolicyDocument = {
      version: 1,
      denyCapabilities: ["run_shell"],
    };
    expect(applyStandingPolicyOverlay("allow", "run_shell", doc)).toBe("deny");
    expect(applyStandingPolicyOverlay("escalate", "run_shell", doc)).toBe("deny");
  });
});
