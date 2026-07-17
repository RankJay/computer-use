/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACTUATE_API_URL?: string;
  readonly VITE_ACTUATE_WEB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
