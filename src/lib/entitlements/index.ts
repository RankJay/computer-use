export type {
  EntitlementCapabilityClass,
  EntitlementCheck,
  EntitlementDecision,
  EntitlementSubject,
  ModelTier,
  PlanDocument,
} from "./types";

export { capabilityClassOf, modelTierOf } from "./classify";
export { HOBBY_PLAN, METER_KEY_ATTEMPTS, METER_KEY_COMPUTER_USE } from "./plans";
export { utcDayKey } from "./period";
export {
  createEntitlementPolicy,
  type AuthorizeOptions,
  type EntitlementPolicy,
  type EntitlementPolicyDeps,
} from "./policy";
export { resolveEntitlementSubjectId } from "./subject";
export type { MeterStore } from "./meters/persistence";
export { createMeterStore } from "./meters/persistence";
export { MemoryMeterStore } from "./meters/adapters/memory-store";
export { TauriSqlMeterStore } from "./meters/adapters/tauri-sql-store";
