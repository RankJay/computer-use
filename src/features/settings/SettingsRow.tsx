import type { ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils";

type SettingsRowProps = {
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function SettingsRow({
  label,
  description,
  children,
  className,
}: SettingsRowProps): ReactElement {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-6 px-4 py-3.5 [-webkit-app-region:no-drag]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm text-[#eaeaea]">{label}</span>
        {description ? (
          <span className="text-xs leading-relaxed text-[#767676]">{description}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
