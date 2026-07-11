import { describe, expect, mock, test } from "bun:test";

const invokeMock = mock(async (command: string) => {
  void command;
});

mock.module("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

mock.module("@/lib/agent/is-tauri-runtime", () => ({
  isTauriRuntime: () => true,
}));

const { notify, notifyIfUnfocused } = await import("@/lib/native/notification");

const sample = { title: "Quietly done", body: "Your reply is ready. Click to hop back in." };

describe("native/notification", () => {
  test("notify invokes without onlyIfUnfocused", () => {
    invokeMock.mockClear();
    notify(sample);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("notify", {
      title: sample.title,
      body: sample.body,
      onlyIfUnfocused: false,
    });
  });

  test("notifyIfUnfocused sets onlyIfUnfocused", () => {
    invokeMock.mockClear();
    notifyIfUnfocused(sample);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("notify", {
      title: sample.title,
      body: sample.body,
      onlyIfUnfocused: true,
    });
  });
});
