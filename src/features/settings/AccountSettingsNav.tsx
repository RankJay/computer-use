import { ChevronRight } from "lucide-react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import { SettingsSection } from "@/features/settings/SettingsSection";

export function AccountSettingsNav(): ReactElement {
  return (
    <SettingsSection title="Account">
      <Link
        to="/settings/account"
        replace
        className="flex items-center justify-between gap-6 px-4 py-3.5 text-foreground transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm text-foreground">Account</span>
          <span className="text-[13px] leading-4 text-[#767676]">
            Sign in, profile, and sign out
          </span>
        </div>
        <ChevronRight className="size-4 shrink-0 text-[#3F3F3F]" aria-hidden />
      </Link>
    </SettingsSection>
  );
}
