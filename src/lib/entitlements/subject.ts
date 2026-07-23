import type { QueryClient } from "@tanstack/react-query";

import { authKeys } from "@/lib/auth/keys";
import { getSessionToken } from "@/lib/auth/token-store";
import type { AuthUser } from "@/lib/auth/types";

/**
 * Entitlement subject for meters. Signed-in → user id; else anonymous.
 * Both still resolve to the hobby plan (v0); subject only namespaces meters.
 */
export async function resolveEntitlementSubjectId(queryClient: QueryClient): Promise<string> {
  const cached = queryClient.getQueryData<AuthUser | null>(authKeys.session());
  if (cached?.id) {
    return `user:${cached.id}`;
  }

  const token = await getSessionToken();
  if (!token) {
    return "anonymous";
  }

  // Session may not be hydrated yet; keep meters on anonymous until auth cache fills.
  return "anonymous";
}
