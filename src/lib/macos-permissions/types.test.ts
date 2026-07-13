import { describe, expect, test } from "bun:test";

import { missingMacOsPermissions, type MacOsPermissionStatus } from "@/lib/macos-permissions/types";

describe("missingMacOsPermissions", () => {
  test("returns only permissions that are not granted", () => {
    const status: MacOsPermissionStatus = {
      accessibility: true,
      inputMonitoring: false,
      screenRecording: true,
    };

    expect(missingMacOsPermissions(status).map((entry) => entry.kind)).toEqual(["inputMonitoring"]);
  });

  test("returns empty when all granted", () => {
    const status: MacOsPermissionStatus = {
      accessibility: true,
      inputMonitoring: true,
      screenRecording: true,
    };

    expect(missingMacOsPermissions(status)).toEqual([]);
  });
});
