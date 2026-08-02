/** Capabilities whose completed output carries screenshot geometry (host remap). */

const sources = new Set<string>();

export function registerScreenshotGeometrySource(name: string): void {
  sources.add(name);
}

export function isScreenshotGeometrySource(name: string): boolean {
  return sources.has(name);
}

export function listScreenshotGeometrySources(): string[] {
  return [...sources].sort();
}
