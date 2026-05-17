/**
 * Static sample tree for web builds (`public/browser-samples`). Listed in manifest.json.
 */
export const BROWSER_SAMPLE_WORKSPACE_ROOT = "__actuate_browser_samples__";

const SAMPLES_BASE = "/browser-samples";

type Manifest = {
  entries: ReadonlyArray<{ path: string }>;
};

export function isBrowserSampleWorkspace(workspaceRoot: string | null): boolean {
  return workspaceRoot === BROWSER_SAMPLE_WORKSPACE_ROOT;
}

function normalizeRelativeSegments(relativePath: string): string {
  const rel = relativePath.trim().replace(/\\/g, "/");
  if (rel.startsWith("/")) {
    throw new Error("Path must be relative.");
  }
  if (rel.split("/").some((s: string) => s === "..")) {
    throw new Error("Path must not contain '..'.");
  }
  return rel.replace(/\/+$/, "");
}

export function browserSampleFileUrl(relativePath: string): string {
  const norm = normalizeRelativeSegments(relativePath);
  if (!norm) {
    throw new Error("Path is empty.");
  }
  return `${SAMPLES_BASE}/${norm}`;
}

export async function loadBrowserSampleManifest(): Promise<Manifest> {
  const res = await fetch(`${SAMPLES_BASE}/manifest.json`);
  if (!res.ok) {
    throw new Error(`Could not load sample manifest (${res.status}).`);
  }
  return (await res.json()) as Manifest;
}

/** Immediate children (names only) for manifest-backed static tree. */
export async function listBrowserSampleChildren(relativeDir: string): Promise<string[]> {
  const manifest = await loadBrowserSampleManifest();
  const dir = normalizeRelativeSegments(relativeDir);
  const children = new Set<string>();

  for (const { path: p } of manifest.entries) {
    if (dir === "") {
      const top = p.split("/")[0];
      if (top) children.add(top);
      continue;
    }
    const prefix = `${dir}/`;
    if (p === dir) {
      continue;
    }
    if (p.startsWith(prefix)) {
      const rest = p.slice(prefix.length);
      const name = rest.split("/")[0];
      if (name) children.add(name);
    }
  }

  return [...children].sort((a, b) => a.localeCompare(b));
}
