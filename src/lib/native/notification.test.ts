import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const invokeMock = mock(async (command: string) => {
  void command;
});

const isPermissionGrantedMock = mock(async () => true);
const requestPermissionMock = mock(async () => "granted" as const);

mock.module("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

mock.module("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: isPermissionGrantedMock,
  requestPermission: requestPermissionMock,
}));

mock.module("sonner", () => ({
  toast: { message: mock(() => undefined) },
}));

const { notify, notifyIfUnfocused } = await import("@/lib/native/notification");

const sample = { title: "Quietly done", body: "Your reply is ready. Click to hop back in." };

function installTauriWindow(): void {
  Object.defineProperty(globalThis, "window", {
    value: { __TAURI_INTERNALS__: {} },
    configurable: true,
  });
}

function uninstallTauriWindow(): void {
  Reflect.deleteProperty(globalThis, "window");
}

describe("native/notification", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    isPermissionGrantedMock.mockClear();
    requestPermissionMock.mockClear();
    installTauriWindow();
  });

  afterEach(() => {
    uninstallTauriWindow();
  });

  test("notify invokes without onlyIfUnfocused", async () => {
    notify(sample);
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("notify", {
      title: sample.title,
      body: sample.body,
      onlyIfUnfocused: false,
    });
  });

  test("notifyIfUnfocused sets onlyIfUnfocused", async () => {
    notifyIfUnfocused(sample);
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("notify", {
      title: sample.title,
      body: sample.body,
      onlyIfUnfocused: true,
    });
  });
});
