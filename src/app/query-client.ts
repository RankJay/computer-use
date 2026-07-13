import { QueryClient, focusManager } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { isTauriRuntime } from "@/lib/agent/is-tauri-runtime";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Tauri webviews never fire `visibilitychange` on window focus changes
// (tauri-apps/tauri#9524, #10592), which is all v5's focusManager listens to.
// Feed it the native window focus event instead.
if (isTauriRuntime()) {
  focusManager.setEventListener((handleFocus) => {
    const listening = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      handleFocus(focused);
    });
    return () => {
      void listening.then((unlisten) => unlisten());
    };
  });
}
