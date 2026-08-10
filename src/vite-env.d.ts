/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACTUATE_API_URL?: string;
  readonly VITE_ACTUATE_WEB_URL?: string;
  /** Opt in to the desktop updater during `tauri dev` (also accepts shell `ACTUATE_UPDATER=1`). */
  readonly VITE_ACTUATE_UPDATER?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  /** Explicit opt-in; capture stays off without this even if a key is present. */
  readonly VITE_POSTHOG_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
