import { describe, expect, test } from "bun:test";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { createSettingsPermissionPolicy } from "./permission-policy";

describe("PermissionPolicy", () => {
  const policy = createSettingsPermissionPolicy();

  test("low risk → allow", () => {
    expect(
      policy.resolve({
        name: "read_file",
        risk: "low",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
      }),
    ).toBe("allow");
  });

  test("high risk in risky mode → escalate", () => {
    expect(
      policy.resolve({
        name: "delete_path",
        risk: "high",
        destructive: true,
        settings: { ...DEFAULT_SETTINGS, permissionMode: "risky" },
      }),
    ).toBe("escalate");
  });

  test("persisted approval → allow", () => {
    expect(
      policy.resolve({
        name: "delete_path",
        risk: "high",
        destructive: true,
        settings: {
          ...DEFAULT_SETTINGS,
          permissionMode: "every-meaningful",
          persistedApprovals: ["delete_path"],
        },
      }),
    ).toBe("allow");
  });

  test("empty standing policy ≡ settings-only", () => {
    expect(
      policy.resolve({
        name: "delete_path",
        risk: "high",
        destructive: true,
        settings: { ...DEFAULT_SETTINGS, permissionMode: "risky" },
        standingPolicy: null,
      }),
    ).toBe("escalate");
  });

  test("standing allowCapabilities → allow without escalate", () => {
    expect(
      policy.resolve({
        name: "delete_path",
        risk: "high",
        destructive: true,
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
        standingPolicy: { version: 1, allowCapabilities: ["delete_path"] },
      }),
    ).toBe("allow");
  });
});
