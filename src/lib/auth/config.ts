const DEFAULT_API_URL = "https://actuate-be.vercel.app";
const DEFAULT_WEB_URL = "https://actuate-web.vercel.app";

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function readEnvUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimTrailingSlash(trimmed);
}

export function getActuateApiUrl(): string {
  return readEnvUrl(import.meta.env.VITE_ACTUATE_API_URL, DEFAULT_API_URL);
}

export function getActuateWebUrl(): string {
  return readEnvUrl(import.meta.env.VITE_ACTUATE_WEB_URL, DEFAULT_WEB_URL);
}

export function getSignInUrl(): string {
  return `${getActuateWebUrl()}/login`;
}
