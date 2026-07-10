import { afterEach, describe, expect, mock, test } from "bun:test";

const invokeMock = mock(async (command: string) => {
  void command;
});

mock.module("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const { clearLogs, openLogsFolder, resetSession } = await import("@/lib/maintenance/commands");

describe("maintenance commands", () => {
  afterEach(() => {
    invokeMock.mockClear();
  });

  test("openLogsFolder invokes open_logs_folder", async () => {
    await openLogsFolder();
    expect(invokeMock).toHaveBeenCalledWith("open_logs_folder");
  });

  test("clearLogs invokes clear_logs", async () => {
    await clearLogs();
    expect(invokeMock).toHaveBeenCalledWith("clear_logs");
  });

  test("resetSession invokes reset_session", async () => {
    await resetSession();
    expect(invokeMock).toHaveBeenCalledWith("reset_session");
  });
});
