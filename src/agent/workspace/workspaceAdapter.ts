import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "@/agent/native/nativeBridge";
import { TAURI_COMMAND } from "@/agent/native/tauriIpc";
import {
  browserSampleFileUrl,
  isBrowserSampleWorkspace,
  listBrowserSampleChildren,
} from "@/agent/workspace/browserWorkspace";

export type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export type WorkspaceAdapter = {
  readFile: (workspaceRoot: string, relativePath: string) => Promise<string>;
  listDirectory: (workspaceRoot: string, relativeDir: string) => Promise<string[]>;
  writeFile: (workspaceRoot: string, relativePath: string, content: string) => Promise<string>;
};

export type WorkspaceAdapterDependencies = {
  readonly isTauriRuntime: () => boolean;
  readonly invoke: TauriInvoke;
  readonly fetch: (url: string) => Promise<Response>;
};

const invokeTauri: TauriInvoke = (command, args) => invoke<unknown>(command, args);

function requireStringResult(value: unknown, command: string): string {
  if (typeof value === "string") return value;
  throw new Error(`Tauri command ${command} returned an invalid string response.`);
}

function requireStringArrayResult(value: unknown, command: string): string[] {
  if (Array.isArray(value) && value.every((item): item is string => typeof item === "string")) {
    return value;
  }
  throw new Error(`Tauri command ${command} returned an invalid string array response.`);
}

function requireBrowserSampleWorkspace(workspaceRoot: string, operation: "read" | "list"): void {
  if (isBrowserSampleWorkspace(workspaceRoot)) return;
  const action = operation === "read" ? "reads" : "lists";
  const suffix =
    operation === "read"
      ? "Use the default workspace or the desktop app for a real folder."
      : "Use the desktop app to browse a real folder.";
  throw new Error(`Web build only ${action} the bundled sample workspace. ${suffix}`);
}

export function createWorkspaceAdapter(deps: WorkspaceAdapterDependencies): WorkspaceAdapter {
  return {
    readFile: async (workspaceRoot, relativePath) => {
      if (!deps.isTauriRuntime()) {
        requireBrowserSampleWorkspace(workspaceRoot, "read");
        const res = await deps.fetch(browserSampleFileUrl(relativePath));
        if (!res.ok) {
          throw new Error(`Failed to read ${relativePath} (${res.status}).`);
        }
        return await res.text();
      }
      const result = await deps.invoke(TAURI_COMMAND.readWorkspaceFile, {
        workspaceRoot,
        relativePath,
      });
      return requireStringResult(result, TAURI_COMMAND.readWorkspaceFile);
    },
    listDirectory: async (workspaceRoot, relativeDir) => {
      if (!deps.isTauriRuntime()) {
        requireBrowserSampleWorkspace(workspaceRoot, "list");
        return listBrowserSampleChildren(relativeDir);
      }
      const result = await deps.invoke(TAURI_COMMAND.listWorkspaceDir, {
        workspaceRoot,
        relativeDir,
      });
      return requireStringArrayResult(result, TAURI_COMMAND.listWorkspaceDir);
    },
    writeFile: async (workspaceRoot, relativePath, content) => {
      if (!deps.isTauriRuntime()) {
        throw new Error("Writing workspace files requires the Tauri desktop app.");
      }
      const result = await deps.invoke(TAURI_COMMAND.writeWorkspaceFile, {
        workspaceRoot,
        relativePath,
        content,
      });
      return requireStringResult(result, TAURI_COMMAND.writeWorkspaceFile);
    },
  };
}

export const workspaceAdapter = createWorkspaceAdapter({
  isTauriRuntime,
  invoke: invokeTauri,
  fetch: (url) => fetch(url),
});

export function readWorkspaceFile(workspaceRoot: string, relativePath: string): Promise<string> {
  return workspaceAdapter.readFile(workspaceRoot, relativePath);
}

export function listWorkspaceDirectory(
  workspaceRoot: string,
  relativeDir: string,
): Promise<string[]> {
  return workspaceAdapter.listDirectory(workspaceRoot, relativeDir);
}

export function writeWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
  content: string,
): Promise<string> {
  return workspaceAdapter.writeFile(workspaceRoot, relativePath, content);
}
