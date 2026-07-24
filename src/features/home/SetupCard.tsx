import { Check, ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";

import { ensureSecretsReady, useSettingsSelector } from "@/lib/settings/queries";
import { settingsSectionHref } from "@/lib/settings/section-ids";
import { selectSetupProgress } from "@/lib/settings/selectors";
import { cn } from "@/lib/utils";

type SetupTodoProps = {
  readonly done: boolean;
  readonly title: string;
  readonly subtitle: string;
  readonly to: string;
};

function SetupTodo({ done, title, subtitle, to }: SetupTodoProps): ReactElement {
  return (
    <Link
      to={to}
      aria-label={done ? `${title} (done)` : title}
      className={cn(
        "group flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-white/3",
        done && "opacity-80",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border-0",
            done ? "border-foreground/40 bg-emerald-800" : "border-emerald-500/10",
          )}
          aria-hidden
        >
          {done ? <Check className="size-2.5 text-white" strokeWidth={3} /> : null}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={cn("text-sm", done ? "text-muted-foreground" : "text-foreground")}>
            {title}
          </span>
          <span className="text-[13px] leading-4 text-[#767676]">{subtitle}</span>
        </span>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-[#3F3F3F] opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </Link>
  );
}

/**
 * Empty-home onboarding checklist. Visibility is derived from settings
 * (workspace + Anthropic/OpenAI key) — no separate onboarding store.
 */
export function SetupCard(): ReactElement | null {
  const progress = useSettingsSelector(selectSetupProgress);
  const [secretsReady, setSecretsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void ensureSecretsReady()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setSecretsReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!secretsReady || !progress.incomplete) {
    return null;
  }

  return (
    <div className="w-full max-w-md overflow-hidden rounded-xl bg-[#141414] text-foreground shadow-layered">
      <div className="border-b border-[#252525] px-3.5 py-3">
        <p className="text-base font-[445] text-foreground">Let&apos;s set you up!</p>
      </div>
      <div className="divide-y divide-[#252525]">
        <SetupTodo
          done={progress.workspaceDone}
          title="Set workspace root"
          subtitle="Choose the folder Actuate can work in."
          to={settingsSectionHref("workspace")}
        />
        <SetupTodo
          done={progress.apiKeyDone}
          title="Add an API key"
          subtitle="Anthropic or OpenAI — either one works."
          to={settingsSectionHref("apiKeys")}
        />
      </div>
    </div>
  );
}
