import { afterEach, describe, expect, mock, test } from "bun:test";

const invokeMock = mock(() =>
  Promise.resolve({ name: "ACTUATE_UPDATER", value: null as string | null, set: false }),
);
const isTauriRuntimeMock = mock(() => true);

mock.module("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

mock.module("@/lib/agent/is-tauri-runtime", () => ({
  isTauriRuntime: isTauriRuntimeMock,
}));

describe("isUpdaterEnabled", () => {
  afterEach(() => {
    invokeMock.mockClear();
    isTauriRuntimeMock.mockClear();
    isTauriRuntimeMock.mockImplementation(() => true);
  });

  test("false outside Tauri", async () => {
    isTauriRuntimeMock.mockImplementation(() => false);
    const { isUpdaterEnabled } = await import("@/lib/updater/enabled");
    expect(await isUpdaterEnabled()).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
