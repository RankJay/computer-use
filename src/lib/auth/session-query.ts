import { queryOptions } from "@tanstack/react-query";

import { fetchAuthSession } from "@/lib/auth/api";
import { authKeys } from "@/lib/auth/keys";
import { clearAuthSession, getSessionToken } from "@/lib/auth/token-store";
import type { AuthUser } from "@/lib/auth/types";

const AUTH_STALE_TIME_MS = 5 * 60 * 1000;

/** Session hydrate query — no analytics imports (safe for analytics boot). */
export function sessionQueryOptions() {
  return queryOptions({
    queryKey: authKeys.session(),
    queryFn: async (): Promise<AuthUser | null> => {
      const token = await getSessionToken();
      if (!token) {
        return null;
      }
      const user = await fetchAuthSession(token);
      if (!user) {
        await clearAuthSession();
        return null;
      }
      return user;
    },
    staleTime: AUTH_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
