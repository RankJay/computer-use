import type { ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils";

type SettingsRowProps = {
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
  id?: string;
};

export function SettingsRow({
  label,
  description,
  children,
  className,
  id,
}: SettingsRowProps): ReactElement {
  return (
    <div
      id={id}
      className={cn("flex items-center justify-between gap-6 px-4 py-3.5 scroll-mt-4", className)}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm text-foreground">{label}</span>
        {description ? (
          <span className="text-[13px] leading-4 text-[#767676]">{description}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
