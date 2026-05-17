import { describe, expect, test } from "bun:test";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/browserWorkspace";
import { TAURI_COMMAND } from "@/agent/tauriIpc";
import { createWorkspaceAdapter, type TauriInvoke } from "@/agent/workspaceAdapter";

describe("workspaceAdapter", () => {
  test("browser workspace rejects non-sample roots for read and list", async () => {
    const adapter = createWorkspaceAdapter({
      isTauriRuntime: () => false,
      invoke: async () => null,
      fetch: async () => new Response(""),
    });

    await expect(adapter.readFile("d:/project", "src/main.ts")).rejects.toThrow(
      "Web build only reads the bundled sample workspace",
    );
    await expect(adapter.listDirectory("d:/project", "src")).rejects.toThrow(
      "Web build only lists the bundled sample workspace",
    );
  });

  test("browser sample workspace reads via static sample URL", async () => {
    const fetchedUrls: string[] = [];
    const adapter = createWorkspaceAdapter({
      isTauriRuntime: () => false,
      invoke: async () => null,
      fetch: async (url) => {
        fetchedUrls.push(url);
        return new Response("sample file");
      },
    });

    await expect(adapter.readFile(BROWSER_SAMPLE_WORKSPACE_ROOT, "src/main.ts")).resolves.toBe(
      "sample file",
    );
    expect(fetchedUrls).toEqual(["/browser-samples/src/main.ts"]);
  });

  test("tauri workspace adapter calls expected command names", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke: TauriInvoke = async (command, args) => {
      calls.push({ command, args });
      if (command === TAURI_COMMAND.listWorkspaceDir) return ["src"];
      if (command === TAURI_COMMAND.writeWorkspaceFile) return "d:/project/src/main.ts";
      return "file text";
    };
    const adapter = createWorkspaceAdapter({
      isTauriRuntime: () => true,
      invoke,
      fetch: async () => new Response(""),
    });

    await expect(adapter.readFile("d:/project", "src/main.ts")).resolves.toBe("file text");
    await expect(adapter.listDirectory("d:/project", "src")).resolves.toEqual(["src"]);
    await expect(adapter.writeFile("d:/project", "src/main.ts", "content")).resolves.toBe(
      "d:/project/src/main.ts",
    );

    expect(calls.map((call) => call.command)).toEqual([
      TAURI_COMMAND.readWorkspaceFile,
      TAURI_COMMAND.listWorkspaceDir,
      TAURI_COMMAND.writeWorkspaceFile,
    ]);
  });
});
