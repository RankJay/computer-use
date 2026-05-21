import { describe, expect, test } from "bun:test";

import { TAURI_COMMAND } from "@/agent/native/tauriIpc";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/workspace/browserWorkspace";
import { createWorkspaceAdapter, type TauriInvoke } from "@/agent/workspace/workspaceAdapter";

describe("workspaceAdapter", () => {
  test("browser workspace rejects non-sample roots for read and list", async () => {
    const adapter = createWorkspaceAdapter({
      isDesktop: () => false,
      invoke: async () => null,
      fetch: async () => new Response(""),
    });

    await expect(adapter.readFile("d:/project", "src/main.ts")).rejects.toThrow(
      "Web build only reads the bundled sample workspace",
    );
    await expect(adapter.listDirectory("d:/project", "src")).rejects.toThrow(
      "Web build only lists the bundled sample workspace",
    );
    await expect(
      adapter.copyFile("d:/project", "src/main.ts", "src/copy.ts", {
        overwrite: false,
        createParents: true,
      }),
    ).rejects.toThrow("Copying workspace files requires the Tauri desktop app");
    await expect(
      adapter.movePath("d:/project", "src/main.ts", "src/moved.ts", {
        overwrite: false,
        createParents: true,
      }),
    ).rejects.toThrow("Moving workspace paths requires the Tauri desktop app");
  });

  test("browser sample workspace reads via static sample URL", async () => {
    const fetchedUrls: string[] = [];
    const adapter = createWorkspaceAdapter({
      isDesktop: () => false,
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
      if (command === TAURI_COMMAND.copyWorkspaceFile) return "d:/project/src/copy.ts";
      if (command === TAURI_COMMAND.moveWorkspacePath) return "d:/project/src/moved.ts";
      return "file text";
    };
    const adapter = createWorkspaceAdapter({
      isDesktop: () => true,
      invoke,
      fetch: async () => new Response(""),
    });

    await expect(adapter.readFile("d:/project", "src/main.ts")).resolves.toBe("file text");
    await expect(adapter.listDirectory("d:/project", "src")).resolves.toEqual(["src"]);
    await expect(adapter.writeFile("d:/project", "src/main.ts", "content")).resolves.toBe(
      "d:/project/src/main.ts",
    );
    await expect(
      adapter.copyFile("d:/project", "src/main.ts", "src/copy.ts", {
        overwrite: false,
        createParents: true,
      }),
    ).resolves.toBe("d:/project/src/copy.ts");
    await expect(
      adapter.movePath("d:/project", "src/main.ts", "src/moved.ts", {
        overwrite: true,
        createParents: false,
      }),
    ).resolves.toBe("d:/project/src/moved.ts");

    expect(calls.map((call) => call.command)).toEqual([
      TAURI_COMMAND.readWorkspaceFile,
      TAURI_COMMAND.listWorkspaceDir,
      TAURI_COMMAND.writeWorkspaceFile,
      TAURI_COMMAND.copyWorkspaceFile,
      TAURI_COMMAND.moveWorkspacePath,
    ]);
    expect(calls.at(-2)?.args).toEqual({
      workspaceRoot: "d:/project",
      sourceRelativePath: "src/main.ts",
      destinationRelativePath: "src/copy.ts",
      overwrite: false,
      createParents: true,
    });
    expect(calls.at(-1)?.args).toEqual({
      workspaceRoot: "d:/project",
      sourceRelativePath: "src/main.ts",
      destinationRelativePath: "src/moved.ts",
      overwrite: true,
      createParents: false,
    });
  });
});
