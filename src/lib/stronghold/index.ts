/**
 * Shared secure vault (Tauri Stronghold).
 *
 * Use for any secret that must not live in plaintext settings store:
 * provider API keys, auth session tokens, future credentials.
 *
 * Prefer `readVaultString` / `writeVaultString(s)` / `clearVaultString(s)` for
 * simple key-value secrets. Use `getStrongholdSession` only when you need
 * the raw Stronghold client (non-string payloads).
 */
export {
  clearVaultString,
  clearVaultStrings,
  decodeStrongholdValue,
  encodeStrongholdValue,
  getStrongholdSession,
  readVaultString,
  type StrongholdSession,
  writeVaultString,
  writeVaultStrings,
} from "@/lib/stronghold/vault";
