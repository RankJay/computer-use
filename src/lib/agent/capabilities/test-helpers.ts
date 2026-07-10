import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import type { InvokeCapabilityDeps } from "./types";

export function createApprovedInvokeDeps(
  overrides: Partial<InvokeCapabilityDeps> & Pick<InvokeCapabilityDeps, "executeNative">,
): InvokeCapabilityDeps {
  return {
    emit: () => {},
    taskId: "task-1",
    settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
    workspaceRoot: "D:/Projects/actuate-v2",
    createPermissionWaiter: () => ({
      waitForDecision: async () => "approved" as const,
    }),
    ...overrides,
  };
}
