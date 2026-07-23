import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const invokeMock = mock(async (command: string) => {
  void command;
});

mock.module("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const { signalAppReady } = await import("@/lib/runtime/app-ready");

function installTauriWindow(): void {
  Object.defineProperty(globalThis, "window", {
    value: { __TAURI_INTERNALS__: {} },
    configurable: true,
  });
}

function uninstallTauriWindow(): void {
  Reflect.deleteProperty(globalThis, "window");
}

describe("signalAppReady", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    installTauriWindow();
  });

  afterEach(() => {
    uninstallTauriWindow();
  });

  test("invokes app_ready once after two animation frames", async () => {
    const frames: FrameRequestCallback[] = [];
    const originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    }) as typeof requestAnimationFrame;

    try {
      signalAppReady();
      signalAppReady();
      expect(invokeMock).not.toHaveBeenCalled();

      expect(frames).toHaveLength(1);
      frames[0]?.(0);
      expect(frames).toHaveLength(2);
      frames[1]?.(0);

      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenCalledWith("app_ready");
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
    }
  });
});
