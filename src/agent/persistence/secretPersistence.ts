import { hostRuntime, type HostRuntime } from "@/agent/host/hostRuntime";

export async function loadSecretKey(
  key: string,
  runtime: HostRuntime = hostRuntime,
): Promise<string | null> {
  return runtime.loadSecret(key);
}

export async function storeSecretKey(
  key: string,
  value: string,
  runtime: HostRuntime = hostRuntime,
): Promise<void> {
  await runtime.storeSecret(key, value);
}

export async function deleteSecretKey(
  key: string,
  runtime: HostRuntime = hostRuntime,
): Promise<void> {
  await runtime.deleteSecret(key);
}
