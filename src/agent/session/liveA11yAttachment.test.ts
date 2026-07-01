import { describe, expect, test } from "bun:test";

import type { UiA11ySnapshotResult } from "@/agent/native/nativeBridge";
import {
  buildA11yAttachmentStep,
  shouldAttachLatestA11ySnapshot,
} from "@/agent/session/liveA11yAttachment";

const snapshot: UiA11ySnapshotResult = {
  platform: "windows",
  app: "Notepad",
  elementCount: 12,
  interactiveCount: 2,
  truncated: false,
  treeText: 'app: Notepad\n  button @e1 "Save"',
  interactiveRefs: [{ id: "@e1", role: "button", name: "Save", enabled: true }],
  nextStep: "ui_a11y_interact",
};

describe("liveA11yAttachment", () => {
  test("shouldAttachLatestA11ySnapshot attaches on the next model step", () => {
    expect(shouldAttachLatestA11ySnapshot(null, 1)).toBe(false);
    expect(shouldAttachLatestA11ySnapshot(snapshot, 0)).toBe(false);
    expect(shouldAttachLatestA11ySnapshot(snapshot, 1)).toBe(true);
  });

  test("buildA11yAttachmentStep includes tree and element ids", () => {
    const step = buildA11yAttachmentStep(snapshot, "save the file");
    const content = step.messages[0]?.content;
    expect(typeof content).toBe("string");
    expect(content).toContain("@e1");
    expect(content).toContain("save the file");
    expect(content).toContain("Notepad");
  });
});
