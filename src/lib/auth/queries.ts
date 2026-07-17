import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { fetchAuthSession, signOutRemote } from "@/lib/auth/api";
import { authKeys } from "@/lib/auth/keys";
import { openSignInInBrowser } from "@/lib/auth/open-sign-in";
import { clearAuthSession, getSessionToken } from "@/lib/auth/token-store";
import type { AuthUser } from "@/lib/auth/types";

export { authKeys };

const AUTH_STALE_TIME_MS = 5 * 60 * 1000;

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

/** Account page only — do not enable at app boot. */
export function useAuthSession(enabled: boolean): UseQueryResult<AuthUser | null> {
  return useQuery({
    ...sessionQueryOptions(),
    enabled,
  });
}

export function useAuthUser(enabled: boolean): AuthUser | null | undefined {
  const { data } = useQuery({
    ...sessionQueryOptions(),
    enabled,
    select: (user) => user,
  });
  return data;
}

export function useIsSignedIn(enabled: boolean): boolean {
  const { data } = useQuery({
    ...sessionQueryOptions(),
    enabled,
    select: (user) => user !== null,
  });
  return data === true;
}

export function useOpenSignIn() {
  return useCallback(async () => {
    try {
      await openSignInInBrowser();
    } catch {
      toast.error("Could not open the sign-in page.");
    }
  }, []);
}

export function useSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const token = await getSessionToken();
      if (token) {
        await signOutRemote(token);
      }
      await clearAuthSession();
    },
    onSuccess: () => {
      queryClient.setQueryData(authKeys.session(), null);
    },
    onError: async () => {
      await clearAuthSession();
      queryClient.setQueryData(authKeys.session(), null);
      toast.error("Signed out locally. Server sign-out may have failed.");
    },
  });
}
