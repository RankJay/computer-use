import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { captureSignInClicked, captureSignOut } from "@/lib/analytics/capture";
import { resetAnalytics } from "@/lib/analytics/identify";
import { signOutRemote } from "@/lib/auth/api";
import { authKeys } from "@/lib/auth/keys";
import { openSignInInBrowser } from "@/lib/auth/open-sign-in";
import { sessionQueryOptions } from "@/lib/auth/session-query";
import { clearAuthSession, getSessionToken } from "@/lib/auth/token-store";
import type { AuthUser } from "@/lib/auth/types";

export { authKeys };
export { sessionQueryOptions } from "@/lib/auth/session-query";

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
      captureSignInClicked();
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
      captureSignOut();
      resetAnalytics();
    },
    onError: async () => {
      await clearAuthSession();
      queryClient.setQueryData(authKeys.session(), null);
      captureSignOut();
      resetAnalytics();
      toast.error("Signed out locally. Server sign-out may have failed.");
    },
  });
}
