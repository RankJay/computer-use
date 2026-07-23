import { beforeEach, describe, expect, mock, test } from "bun:test";

const toastErrorMock = mock(() => undefined);

mock.module("sonner", () => ({
  toast: { error: toastErrorMock },
}));

mock.module("@/lib/runtime/is-tauri-runtime", () => ({
  isTauriRuntime: () => true,
}));

mock.module("@/lib/runtime/platform", () => ({
  isMacOsClient: () => true,
}));

const { reportMacOsPermissionError } = await import("@/lib/macos-permissions/queries");

describe("reportMacOsPermissionError", () => {
  beforeEach(() => {
    toastErrorMock.mockClear();
  });

  test("skips toast for unsupported_platform and exposes the mapped code", () => {
    const mapped = reportMacOsPermissionError({
      code: "unsupported_platform",
      message: "macOS permissions are only available on macOS",
    });

    expect(mapped).toEqual({
      code: "unsupported_platform",
      message: "macOS permissions are only available on macOS",
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  test("toasts the backend message for open_failed", () => {
    const mapped = reportMacOsPermissionError({
      code: "open_failed",
      message: "Failed to open System Settings",
    });

    expect(mapped).toEqual({
      code: "open_failed",
      message: "Failed to open System Settings",
    });
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to open System Settings");
  });
});
