import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import type { AgentPendingPermission, PermissionChoice } from "@/agent/types";
import { PERMISSION_CHOICE_LABELS } from "@/agent/toolContract";
import { ShieldAlert } from "lucide-react";

const CHOICE_ORDER: PermissionChoice[] = ["allow_once", "allow_session", "allow_always", "deny"];

function permissionButtonVariant(
  choice: PermissionChoice,
): "default" | "secondary" | "outline" | "destructive" {
  switch (choice) {
    case "allow_once":
      return "default";
    case "allow_session":
      return "secondary";
    case "allow_always":
      return "outline";
    case "deny":
      return "destructive";
    default: {
      const _never: never = choice;
      return _never;
    }
  }
}

export type PermissionPromptProps = {
  readonly pending: AgentPendingPermission;
  readonly onResolve: (choice: PermissionChoice) => void;
};

export function PermissionPrompt(props: PermissionPromptProps): ReactElement {
  return (
    <section
      className="space-y-3 rounded-2xl border border-amber-900/40 bg-[#141414] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
      aria-labelledby="permission-title"
      aria-describedby="permission-summary"
    >
      <div className="flex gap-3">
        <div className="mt-0.5 shrink-0 text-amber-500/90">
          <ShieldAlert className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h2
              id="permission-title"
              className="text-[15px] font-semibold leading-snug text-[#eaeaea]"
            >
              {props.pending.title}
            </h2>
            {props.pending.toolName !== undefined && props.pending.toolName !== "" && (
              <p className="mt-1 font-mono text-[11px] text-neutral-500">
                {props.pending.toolName}
              </p>
            )}
          </div>
          <p id="permission-summary" className="text-sm leading-relaxed text-neutral-300">
            {props.pending.summary}
          </p>
          {props.pending.rationale.trim() !== "" && (
            <p className="text-xs leading-relaxed text-neutral-500">{props.pending.rationale}</p>
          )}
          <p className="text-xs font-medium leading-relaxed text-amber-200/90">
            {props.pending.risk}
          </p>
          {props.pending.details.trim() !== "" && (
            <details className="group rounded-lg border border-neutral-800 bg-[#0c0c0c]">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-200">
                Technical details
              </summary>
              <div className="max-h-40 overflow-y-auto overscroll-contain border-t border-neutral-800 px-3 py-2">
                <pre className="wrap-break-word font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-neutral-400">
                  {props.pending.details}
                </pre>
              </div>
            </details>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        {CHOICE_ORDER.map((choice) => (
          <Button
            key={choice}
            type="button"
            size="sm"
            variant={permissionButtonVariant(choice)}
            className="h-9 text-xs font-medium"
            onClick={() => props.onResolve(choice)}
          >
            {PERMISSION_CHOICE_LABELS[choice]}
          </Button>
        ))}
      </div>
    </section>
  );
}
