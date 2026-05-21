import { invoke } from "@tauri-apps/api/core";

import { hostRuntime } from "@/agent/host/hostRuntime";
import {
  TAURI_COMMAND,
  type CopyWorkspaceFileRequest,
  type ListWorkspaceDirRequest,
  type MoveWorkspacePathRequest,
  type ReadWorkspaceFileRequest,
  type WriteWorkspaceFileRequest,
} from "@/agent/native/tauriIpc";
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
  copyFile: (
    workspaceRoot: string,
    sourceRelativePath: string,
    destinationRelativePath: string,
    options: WorkspaceTransferOptions,
  ) => Promise<string>;
  movePath: (
    workspaceRoot: string,
    sourceRelativePath: string,
    destinationRelativePath: string,
    options: WorkspaceTransferOptions,
  ) => Promise<string>;
};

export type WorkspaceTransferOptions = {
  readonly overwrite: boolean;
  readonly createParents: boolean;
};

export type WorkspaceAdapterDependencies = {
  readonly isDesktop: () => boolean;
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
      if (!deps.isDesktop()) {
        requireBrowserSampleWorkspace(workspaceRoot, "read");
        const res = await deps.fetch(browserSampleFileUrl(relativePath));
        if (!res.ok) {
          throw new Error(`Failed to read ${relativePath} (${res.status}).`);
        }
        return await res.text();
      }
      const request: ReadWorkspaceFileRequest = { workspaceRoot, relativePath };
      const result = await deps.invoke(TAURI_COMMAND.readWorkspaceFile, request);
      return requireStringResult(result, TAURI_COMMAND.readWorkspaceFile);
    },
    listDirectory: async (workspaceRoot, relativeDir) => {
      if (!deps.isDesktop()) {
        requireBrowserSampleWorkspace(workspaceRoot, "list");
        return listBrowserSampleChildren(relativeDir);
      }
      const request: ListWorkspaceDirRequest = { workspaceRoot, relativeDir };
      const result = await deps.invoke(TAURI_COMMAND.listWorkspaceDir, request);
      return requireStringArrayResult(result, TAURI_COMMAND.listWorkspaceDir);
    },
    writeFile: async (workspaceRoot, relativePath, content) => {
      if (!deps.isDesktop()) {
        throw new Error("Writing workspace files requires the Tauri desktop app.");
      }
      const request: WriteWorkspaceFileRequest = { workspaceRoot, relativePath, content };
      const result = await deps.invoke(TAURI_COMMAND.writeWorkspaceFile, request);
      return requireStringResult(result, TAURI_COMMAND.writeWorkspaceFile);
    },
    copyFile: async (workspaceRoot, sourceRelativePath, destinationRelativePath, options) => {
      if (!deps.isDesktop()) {
        throw new Error("Copying workspace files requires the Tauri desktop app.");
      }
      const request: CopyWorkspaceFileRequest = {
        workspaceRoot,
        sourceRelativePath,
        destinationRelativePath,
        overwrite: options.overwrite,
        createParents: options.createParents,
      };
      const result = await deps.invoke(TAURI_COMMAND.copyWorkspaceFile, request);
      return requireStringResult(result, TAURI_COMMAND.copyWorkspaceFile);
    },
    movePath: async (workspaceRoot, sourceRelativePath, destinationRelativePath, options) => {
      if (!deps.isDesktop()) {
        throw new Error("Moving workspace paths requires the Tauri desktop app.");
      }
      const request: MoveWorkspacePathRequest = {
        workspaceRoot,
        sourceRelativePath,
        destinationRelativePath,
        overwrite: options.overwrite,
        createParents: options.createParents,
      };
      const result = await deps.invoke(TAURI_COMMAND.moveWorkspacePath, request);
      return requireStringResult(result, TAURI_COMMAND.moveWorkspacePath);
    },
  };
}

export const workspaceAdapter = createWorkspaceAdapter({
  isDesktop: () => hostRuntime.isDesktop,
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

export function copyWorkspaceFile(
  workspaceRoot: string,
  sourceRelativePath: string,
  destinationRelativePath: string,
  options: WorkspaceTransferOptions,
): Promise<string> {
  return workspaceAdapter.copyFile(
    workspaceRoot,
    sourceRelativePath,
    destinationRelativePath,
    options,
  );
}

export function moveWorkspacePath(
  workspaceRoot: string,
  sourceRelativePath: string,
  destinationRelativePath: string,
  options: WorkspaceTransferOptions,
): Promise<string> {
  return workspaceAdapter.movePath(
    workspaceRoot,
    sourceRelativePath,
    destinationRelativePath,
    options,
  );
}
