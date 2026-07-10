import { describe, expect, test } from "bun:test";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { invokeCapability } from "../invoke";
import { createApprovedInvokeDeps } from "../test-helpers";
import { processKillInputSchema } from "./process-kill";

describe("shell process capabilities", () => {
  test("process_kill schema requires exactly one selector", () => {
    expect(processKillInputSchema.safeParse({}).success).toBe(false);
    expect(processKillInputSchema.safeParse({ pid: 1, name: "notepad.exe" }).success).toBe(false);
    expect(processKillInputSchema.safeParse({ pid: 1 }).success).toBe(true);
    expect(processKillInputSchema.safeParse({ name: "notepad.exe" }).success).toBe(true);
  });

  test("invokeCapability returns process_list output", async () => {
    const result = await invokeCapability(
      "process_list",
      {},
      createApprovedInvokeDeps({
        executeNative: async () => ({ text: "123  notepad.exe", count: 1 }),
      }),
      "call-1",
    );

    expect(result).toEqual({
      ok: true,
      output: { text: "123  notepad.exe", count: 1 },
    });
  });

  test("invokeCapability returns launch output", async () => {
    const result = await invokeCapability(
      "launch",
      { exe: "notepad.exe" },
      createApprovedInvokeDeps({
        executeNative: async () => ({ pid: 456, exe: "notepad.exe" }),
      }),
      "call-2",
    );

    expect(result).toEqual({
      ok: true,
      output: { pid: 456, exe: "notepad.exe" },
    });
  });

  test("invokeCapability returns get_env output", async () => {
    const result = await invokeCapability(
      "get_env",
      { name: "PATH" },
      {
        emit: () => {},
        taskId: "task-1",
        settings: DEFAULT_SETTINGS,
        workspaceRoot: "D:/Projects/actuate-v2",
        executeNative: async () => ({ name: "PATH", value: "C:\\Windows", set: true }),
      },
      "call-3",
    );

    expect(result).toEqual({
      ok: true,
      output: { name: "PATH", value: "C:\\Windows", set: true },
    });
  });
});
