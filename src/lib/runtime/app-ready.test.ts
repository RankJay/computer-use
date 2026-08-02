import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const invokeMock = mock(async (command: string) => {
  void command;
});

let macOs = false;

mock.module("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

mock.module("@/lib/runtime/platform", () => ({
  isMacOsClient: () => macOs,
}));

const { resetAppReadyForTests, signalAppReady } = await import("@/lib/runtime/app-ready");

function installTauriWindow(visibilityState: DocumentVisibilityState = "visible"): void {
  Object.defineProperty(globalThis, "window", {
    value: { __TAURI_INTERNALS__: {} },
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: { visibilityState },
    configurable: true,
  });
}

function uninstallGlobals(): void {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
}

describe("signalAppReady", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    resetAppReadyForTests();
    macOs = false;
    installTauriWindow("visible");
  });

  afterEach(() => {
    uninstallGlobals();
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

  test("on macOS with hidden document, invokes app_ready immediately without rAF", () => {
    macOs = true;
    installTauriWindow("hidden");

    const originalRaf = globalThis.requestAnimationFrame;
    let rafCalls = 0;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCalls += 1;
      void cb;
      return rafCalls;
    }) as typeof requestAnimationFrame;

    try {
      signalAppReady();
      expect(rafCalls).toBe(0);
      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenCalledWith("app_ready");
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
    }
  });

  test("on macOS with visible document, still waits for two animation frames", () => {
    macOs = true;
    installTauriWindow("visible");

    const frames: FrameRequestCallback[] = [];
    const originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    }) as typeof requestAnimationFrame;

    try {
      signalAppReady();
      expect(invokeMock).not.toHaveBeenCalled();
      frames[0]?.(0);
      frames[1]?.(0);
      expect(invokeMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
    }
  });
});
