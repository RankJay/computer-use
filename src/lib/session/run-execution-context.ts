import type { EntitlementPolicy } from "@/lib/entitlements";
import type { StandingPolicyDocument } from "@/lib/mandates/types";
import type { AppSettings } from "@/lib/settings/types";

import type { EscalationPort } from "./control/escalation-port";
import type { OsLease } from "./control/os-lease";
import type { RuntimeEvent, RuntimeEventPayload } from "./events";

/**
 * Fields threaded through every live run / capability invoke path.
 * Not the compacted model message pack (`ModelContext` in `model-context.ts`).
 * Agent and capability deps bags extend or Pick from this — not a god-type.
 */
export type RunExecutionContext = {
  attemptId: string;
  append: (payload: RuntimeEventPayload) => unknown;
  settings: AppSettings;
  workspaceRoot: string;
  escalationPort: EscalationPort;
  entitlements?: EntitlementPolicy;
  osLease?: OsLease;
  standingPolicy?: StandingPolicyDocument | null;
  getEventLog?: () => readonly RuntimeEvent[];
};
