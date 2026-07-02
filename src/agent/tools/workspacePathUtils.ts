/** Workspace-relative path helpers (POSIX-style separators). */

export function renameRelativePath(relativePath: string, newName: string): string {
  const trimmedName = newName.trim();
  if (trimmedName.length === 0) {
    throw new Error("newName must not be empty.");
  }
  if (trimmedName.includes("/") || trimmedName.includes("\\")) {
    throw new Error("newName must be a single file or folder name without path separators.");
  }
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const slash = normalized.lastIndexOf("/");
  if (slash === -1) {
    return trimmedName;
  }
  return `${normalized.slice(0, slash)}/${trimmedName}`;
}
