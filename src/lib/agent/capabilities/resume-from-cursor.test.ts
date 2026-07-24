import { describe, expect, test } from "bun:test";

import { createAutoEscalationPort } from "@/lib/session/control/escalation-port";
import type { RuntimeEvent } from "@/lib/session/events";
import { RUNTIME_EVENT_SCHEMA_VERSION } from "@/lib/session/events";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { createMockCapabilityInvoker } from "./native-invoke";
import { lookupSettledCapability } from "./resume-from-cursor";
import { runCapability } from "./runner";

function event(partial: RuntimeEvent): RuntimeEvent {
  return partial;
}

describe("lookupSettledCapability", () => {
  test("returns completed output for callId", () => {
    const events: RuntimeEvent[] = [
      event({
        type: "capability.completed",
        eventId: "1",
        attemptId: "t",
        timestamp: 1,
        schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
        callId: "c1",
        capability: "read_file",
        output: { content: "x" },
      }),
    ];
    expect(lookupSettledCapability(events, "c1")).toEqual({
      ok: true,
      output: { content: "x" },
    });
  });

  test("returns denied for interaction.resolved permission denied", () => {
    const events: RuntimeEvent[] = [
      event({
        type: "interaction.resolved",
        eventId: "1",
        attemptId: "t",
        timestamp: 1,
        schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
        callId: "c2",
        kind: "permission",
        permission: {
          decision: "denied",
        },
      }),
    ];
    expect(lookupSettledCapability(events, "c2")).toEqual({ ok: false, denied: true });
  });
});

describe("runCapability resume-from-cursor", () => {
  test("skips native invoke when callId already completed in log", async () => {
    let invoked = false;
    const log: RuntimeEvent[] = [
      event({
        type: "capability.completed",
        eventId: "1",
        attemptId: "t",
        timestamp: 1,
        schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
        callId: "resume-1",
        capability: "read_file",
        output: { path: "a", content: "cached", bytes: 6 },
      }),
    ];

    const result = await runCapability(
      "read_file",
      { path: "src/main.tsx" },
      {
        append: () => {},
        attemptId: "t",
        settings: DEFAULT_SETTINGS,
        workspaceRoot: "D:/Projects/actuate-v3",
        escalationPort: createAutoEscalationPort("allow"),
        getEventLog: () => log,
        invokeNative: createMockCapabilityInvoker({
          read_file: async () => {
            invoked = true;
            return { path: "nope", content: "", bytes: 0 };
          },
        }),
      },
      "resume-1",
    );

    expect(invoked).toBe(false);
    expect(result).toEqual({
      ok: true,
      output: { path: "a", content: "cached", bytes: 6 },
    });
  });
});
