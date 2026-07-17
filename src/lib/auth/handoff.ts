import type { QueryClient } from "@tanstack/react-query";

import { exchangeDeviceToken } from "@/lib/auth/api";
import { authKeys } from "@/lib/auth/keys";
import { writeAuthSession } from "@/lib/auth/token-store";
import { AuthApiError, type AuthUser } from "@/lib/auth/types";

let inFlight: Promise<AuthUser> | null = null;
let inFlightToken: string | null = null;

/** Exchange OTT, persist bearer, hydrate profile cache. Dedupes concurrent same-token calls. */
export async function completeHandoff(token: string, queryClient: QueryClient): Promise<AuthUser> {
  if (inFlight && inFlightToken === token) {
    return inFlight;
  }

  inFlightToken = token;
  inFlight = runHandoff(token, queryClient).finally(() => {
    inFlight = null;
    inFlightToken = null;
  });
  return inFlight;
}

async function runHandoff(token: string, queryClient: QueryClient): Promise<AuthUser> {
  const result = await exchangeDeviceToken(token);
  await writeAuthSession({
    sessionToken: result.sessionToken,
    expiresAt: result.expiresAt,
  });
  queryClient.setQueryData(authKeys.session(), result.user);
  return result.user;
}

export function handoffErrorMessage(error: unknown): string {
  if (error instanceof AuthApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Could not complete sign-in.";
}
