const STORAGE_KEY = "actuate:auth:consumed-ott";
const MAX_ENTRIES = 32;

const memory = new Set<string>();

function canUseSessionStorage(): boolean {
  try {
    return typeof sessionStorage !== "undefined";
  } catch {
    return false;
  }
}

function readPersisted(): string[] {
  if (!canUseSessionStorage()) {
    return [];
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function writePersisted(tokens: string[]): void {
  if (!canUseSessionStorage()) {
    return;
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokens.slice(-MAX_ENTRIES)));
  } catch {
    // Ignore quota / private-mode failures; memory Set still covers this process.
  }
}

export function wasOttConsumed(token: string): boolean {
  if (memory.has(token)) {
    return true;
  }
  return readPersisted().includes(token);
}

/** Persist so refresh does not re-exchange a spent OTT from getCurrent(). */
export function markOttConsumed(token: string): void {
  memory.add(token);
  const existing = readPersisted();
  if (existing.includes(token)) {
    return;
  }
  writePersisted([...existing, token]);
}

/** Test helper. */
export function clearConsumedOttForTests(): void {
  memory.clear();
  if (canUseSessionStorage()) {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
