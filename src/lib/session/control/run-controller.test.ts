import { describe, expect, test } from "bun:test";

import { needsPermission } from "@/lib/agent/capabilities/permission";
import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { createEmptySessionProjection, type SessionProjection } from "../projection";
import { createRunController, type ProduceRun } from "./run-controller";

describe("createRunController persistApproval", () => {
  test("always-allow updates live run settings so later tools skip the prompt", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      permissionMode: "once-per-class" as const,
      persistedApprovals: [] as string[],
    };
    const persisted: string[] = [];
    const projection: SessionProjection = {
      ...createEmptySessionProjection(),
      pendingPermissions: [
        {
          callId: "c1",
          capability: "accessibility_click",
          risk: "high",
          input: { reference: "e1" },
        },
      ],
    };

    const producer: ProduceRun = async ({ createPermissionWaiter, config }) => {
      const decision = await createPermissionWaiter("c1").waitForDecision();
      expect(decision).toBe("approved");
      expect(needsPermission({ name: "accessibility_click", risk: "high" }, config.settings)).toBe(
        false,
      );
    };

    const controller = createRunController({
      append: () => undefined,
      beginTask: () => undefined,
      clearTask: () => undefined,
      getProjection: () => projection,
      produceRun: producer,
    });

    const startPromise = controller.start({
      prompt: "click",
      modelId: "test",
      settings,
      secrets: DEFAULT_SECRETS,
      persistApproval: async (capability) => {
        persisted.push(capability);
      },
    });

    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }

    await controller.resolvePermission("c1", "approved", true);
    await startPromise;

    expect(persisted).toEqual(["accessibility_click"]);
    expect(settings.persistedApprovals).toEqual(["accessibility_click"]);
  });
});
