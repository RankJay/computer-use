import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  createAttemptHost,
  createProduceRun,
  isLiveWorkspaceReady,
  registerAttemptHost,
  type BatchedAttemptStore,
} from "@/lib/session";
import { DEFAULT_SECRETS } from "@/lib/settings/defaults";
import {
  ensureSecretsReady,
  settingsQueryOptions,
  usePersistToolApproval,
} from "@/lib/settings/queries";
import type { LoadedSettings } from "@/lib/settings/types";

const AttemptHostContext = createContext<BatchedAttemptStore | null>(null);

export function useAttemptHost(): BatchedAttemptStore {
  const host = useContext(AttemptHostContext);
  if (!host) {
    throw new Error("useAttemptHost requires AttemptHostProvider");
  }
  return host;
}

/**
 * Tray-kept webview host: AttemptControl + engine live above the router.
 * Chat routes reattach; unmounting Home must not clear the runtime.
 */
export function AttemptHostProvider(props: { readonly children: ReactNode }): ReactElement {
  const queryClient = useQueryClient();
  const persistToolApproval = usePersistToolApproval();

  const depsRef = useRef({
    queryClient,
    persistToolApproval,
  });
  depsRef.current = { queryClient, persistToolApproval };

  const hostRef = useRef<BatchedAttemptStore | null>(null);
  if (hostRef.current === null) {
    hostRef.current = createAttemptHost({
      produceRun: createProduceRun(),
      loadRunContext: async () => {
        const { queryClient: client, persistToolApproval: persistApproval } = depsRef.current;
        const latest = await client.ensureQueryData(settingsQueryOptions());
        const { secrets: _placeholder, ...appSettings } = latest as LoadedSettings;
        if (!isLiveWorkspaceReady(appSettings)) {
          return null;
        }
        const secrets =
          appSettings.agentMode === "live" ? await ensureSecretsReady() : { ...DEFAULT_SECRETS };
        return {
          settings: appSettings,
          secrets,
          persistApproval,
        };
      },
    });
  }

  const host = hostRef.current;

  useEffect(() => {
    registerAttemptHost(host);
    return () => {
      registerAttemptHost(null);
    };
  }, [host]);

  return <AttemptHostContext.Provider value={host}>{props.children}</AttemptHostContext.Provider>;
}
