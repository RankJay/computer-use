import type { ModelMessage } from "ai";

import type { UiA11ySnapshotResult } from "@/agent/native/nativeBridge";

export type A11yAttachmentStep = {
  readonly messages: ModelMessage[];
};

export function shouldAttachLatestA11ySnapshot(
  latestSnapshot: UiA11ySnapshotResult | null,
  stepNumber: number,
): latestSnapshot is UiA11ySnapshotResult {
  return latestSnapshot !== null && stepNumber >= 1;
}

export function buildA11yAttachmentStep(
  snapshot: UiA11ySnapshotResult,
  objective: string,
): A11yAttachmentStep {
  const refsPreview =
    snapshot.interactiveRefs.length > 0
      ? snapshot.interactiveRefs
          .slice(0, 24)
          .map((ref) => {
            const name = ref.name ? ` "${ref.name}"` : "";
            const value = ref.value ? ` value="${ref.value}"` : "";
            return `${ref.id} ${ref.role}${name}${value}`;
          })
          .join("\n")
      : "(no interactive refs — try display_capture)";

  return {
    messages: [
      {
        role: "user",
        content: `Accessibility tree for ${snapshot.app} (${snapshot.platform}).
Original user task remains binding:
${objective.trim()}

Interactive elements (use element_id exactly):
${refsPreview}

Full tree:
${snapshot.treeText}

Next: ui_a11y_interact with element_id @eN — do NOT call ui_a11y_snapshot again unless the UI changed. Use display_capture only if the tree is empty or interaction fails.`,
      },
    ],
  };
}
