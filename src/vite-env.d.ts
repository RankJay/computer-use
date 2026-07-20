/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACTUATE_API_URL?: string;
  readonly VITE_ACTUATE_WEB_URL?: string;
  /** Opt in to the desktop updater during `tauri dev` (also accepts shell `ACTUATE_UPDATER=1`). */
  readonly VITE_ACTUATE_UPDATER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
