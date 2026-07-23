import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { getActuateApiUrl } from "@/lib/auth/config";
import {
  AuthApiError,
  type AuthUser,
  deviceExchangeErrorSchema,
  deviceExchangeSuccessSchema,
  type DeviceExchangeSuccess,
  parseAuthUserFromSession,
} from "@/lib/auth/types";
import { isTauriRuntime } from "@/lib/runtime/is-tauri-runtime";

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${getActuateApiUrl()}${path}`;
  if (isTauriRuntime()) {
    return tauriFetch(url, init);
  }
  return fetch(url, init);
}

function jsonHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  return headers;
}

export async function exchangeDeviceToken(token: string): Promise<DeviceExchangeSuccess> {
  const response = await authFetch("/api/auth/device/exchange", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ token }),
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = deviceExchangeErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new AuthApiError(parsed.data.error, parsed.data.message, response.status);
    }
    throw new AuthApiError(
      "exchange_failed",
      "Could not complete sign-in handoff.",
      response.status,
    );
  }

  const parsed = deviceExchangeSuccessSchema.safeParse(body);
  if (!parsed.success) {
    throw new AuthApiError(
      "exchange_failed",
      "Unexpected handoff response from server.",
      response.status,
    );
  }
  return parsed.data;
}

export async function fetchAuthSession(sessionToken: string): Promise<AuthUser | null> {
  const response = await authFetch("/api/auth/get-session", {
    method: "GET",
    headers: jsonHeaders({
      Authorization: `Bearer ${sessionToken}`,
    }),
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new AuthApiError("session_failed", "Could not load account session.", response.status);
  }

  const body: unknown = await response.json().catch(() => null);
  return parseAuthUserFromSession(body);
}

/** Best-effort server sign-out. Caller always clears local session. */
export async function signOutRemote(sessionToken: string): Promise<void> {
  try {
    await authFetch("/api/auth/sign-out", {
      method: "POST",
      headers: jsonHeaders({
        Authorization: `Bearer ${sessionToken}`,
      }),
      body: JSON.stringify({}),
    });
  } catch {
    // Network failures are ignored — local clear is authoritative.
  }
}
