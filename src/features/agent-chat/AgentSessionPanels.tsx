import type { ReactElement } from "react";
import { useEffect } from "react";

import { cancelPointerAutomation } from "@/agent/native/nativeBridge";
import type { RunBudgetLimit, RunBudgetProgress } from "@/agent/types";

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

export type DisplayNoticeToastProps = {
  readonly displayCount: number;
  readonly onDismiss: () => void;
};

/** Shown once per session when multiple monitors are detected. */
export function DisplayNoticeToast(props: DisplayNoticeToastProps): ReactElement {
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-xl border border-sky-900/45 bg-sky-950/30 px-3 py-2.5 text-[12px] leading-snug text-sky-100/95"
      role="status"
    >
      <p>
        <span className="font-medium text-sky-50/95">
          Multiple monitors detected ({props.displayCount}).
        </span>{" "}
        Screen capture and pointer automation use the primary display only for now. Move target
        windows to your main monitor for reliable UI tasks.
      </p>
      <button
        type="button"
        className="shrink-0 rounded-md border border-sky-800/60 bg-neutral-950/50 px-2 py-0.5 text-[11px] text-sky-100/90 hover:bg-neutral-900/80"
        onClick={props.onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}

export type TaskBudgetBannerProps = {
  readonly limit: RunBudgetLimit;
  readonly progress: RunBudgetProgress;
};

function budgetLimitLabel(limit: RunBudgetLimit, progress: RunBudgetProgress): string {
  switch (limit) {
    case "maxSteps":
      return `${progress.steps}/${progress.budget.maxSteps} steps`;
    case "maxCostUsd":
      return `$${progress.costUsd.toFixed(4)}/$${progress.budget.maxCostUsd.toFixed(2)}`;
    case "maxWallClockMs":
      return `${Math.ceil(progress.wallClockMs / 1000)}s/${Math.ceil(
        progress.budget.maxWallClockMs / 1000,
      )}s`;
    default: {
      const _never: never = limit;
      return _never;
    }
  }
}

export function TaskBudgetBanner(props: TaskBudgetBannerProps): ReactElement {
  return (
    <div className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-3 py-2.5 text-sm leading-relaxed text-amber-100">
      Run stopped at the configured budget limit: {budgetLimitLabel(props.limit, props.progress)}.
    </div>
  );
}
