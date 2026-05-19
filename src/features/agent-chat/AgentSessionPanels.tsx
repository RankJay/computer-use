import type { ReactElement } from "react";
import { useEffect } from "react";

import { cancelPointerAutomation } from "@/agent/native/nativeBridge";

export type PointerAutomationEscBarProps = {
  /** Enables global Esc listener to invoke cancel_pointer_automation. */
  readonly escArmActive: boolean;
  readonly pointerBusy: boolean;
};

/** Shown during UI automation; Esc invokes cancel_pointer_automation (honored between mouse steps / before click). */
export function PointerAutomationEscBar(props: PointerAutomationEscBarProps): ReactElement | null {
  useEffect(() => {
    if (!props.escArmActive) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") {
        return;
      }
      e.preventDefault();
      void cancelPointerAutomation().catch(() => {
        /** ignore invoke errors (capabilities / dev shells) */
      });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [props.escArmActive]);

  if (!props.escArmActive) {
    return null;
  }

  return (
    <output className="block shrink-0 rounded-xl border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-[11px] leading-snug text-amber-100/95">
      <span className="font-medium text-amber-200/95">UI automation in progress.</span>{" "}
      {props.pointerBusy ? (
        <>
          Physical mouse input is swallowed so automation can steer the cursor — keep hands off
          until it finishes or you stop it with{" "}
        </>
      ) : (
        <>Press </>
      )}
      <kbd className="rounded border border-amber-800/70 bg-neutral-950/70 px-1 py-px font-mono text-[10px]">
        Esc
      </kbd>{" "}
      to cancel in-flight automation (effective between mouse steps and before clicks or typing
      bursts).
    </output>
  );
}

export type TaskFailureBannerProps = {
  readonly message: string;
};

export function TaskFailureBanner(props: TaskFailureBannerProps): ReactElement {
  return (
    <div
      className="rounded-xl border border-red-900/50 bg-red-950/35 px-3 py-2.5 text-sm leading-relaxed text-red-100"
      role="alert"
    >
      {props.message}
    </div>
  );
}
