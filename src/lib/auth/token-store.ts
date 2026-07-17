import { clearVaultStrings, readVaultString, writeVaultStrings } from "@/lib/stronghold";

const SESSION_TOKEN_KEY = "authSessionToken";
const SESSION_EXPIRES_AT_KEY = "authSessionExpiresAt";

export type StoredAuthSession = {
  sessionToken: string;
  expiresAt: string | null;
};

type MemorySession = StoredAuthSession | null;

let memory: MemorySession | undefined;
let loadPromise: Promise<MemorySession> | null = null;

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) {
    return false;
  }
  return ms <= Date.now();
}

/** Lazy vault read into memory. Callers opt in; never blocks the core app. */
export async function loadAuthSession(): Promise<MemorySession> {
  if (memory !== undefined) {
    return memory;
  }
  if (!loadPromise) {
    loadPromise = readFromVault()
      .then((session) => {
        memory = session;
        return session;
      })
      .catch((error: unknown) => {
        loadPromise = null;
        throw error;
      });
  }
  return loadPromise;
}

export async function getSessionToken(): Promise<string | null> {
  const session = await loadAuthSession();
  if (!session) {
    return null;
  }
  if (isExpired(session.expiresAt)) {
    await clearAuthSession();
    return null;
  }
  return session.sessionToken;
}

export async function writeAuthSession(session: StoredAuthSession): Promise<void> {
  await writeVaultStrings([
    [SESSION_TOKEN_KEY, session.sessionToken],
    [SESSION_EXPIRES_AT_KEY, session.expiresAt ?? ""],
  ]);
  memory = session;
  loadPromise = Promise.resolve(session);
}

/** Idempotent local clear. */
export async function clearAuthSession(): Promise<void> {
  memory = null;
  loadPromise = Promise.resolve(null);
  await clearVaultStrings([SESSION_TOKEN_KEY, SESSION_EXPIRES_AT_KEY]);
}

async function readFromVault(): Promise<MemorySession> {
  const [sessionToken, expiresAtRaw] = await Promise.all([
    readVaultString(SESSION_TOKEN_KEY),
    readVaultString(SESSION_EXPIRES_AT_KEY),
  ]);
  if (!sessionToken) {
    return null;
  }
  return {
    sessionToken,
    expiresAt: expiresAtRaw.length > 0 ? expiresAtRaw : null,
  };
}
