import { ArrowLeft } from "lucide-react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import {
  ChromeIconButton,
  MinimizeWindowButton,
  TitleBarDragRegion,
} from "@/features/control-center/windowFrame";
import { chromeIconSvgClassName } from "@/features/control-center/windowFrameStyles";

export function SettingsPageHeader(): ReactElement {
  return (
    <header className="relative flex min-h-[44px] shrink-0 select-none items-center gap-2 border-b border-white/6 px-2">
      <ChromeIconButton asChild>
        <Link to="/" aria-label="Back to home">
          <ArrowLeft className={chromeIconSvgClassName} strokeWidth={2} />
        </Link>
      </ChromeIconButton>
      <h1 className="shrink-0 text-base font-medium tracking-tight text-[#eaeaea] [-webkit-app-region:no-drag]">
        Settings
      </h1>
      <TitleBarDragRegion className="min-h-[44px] min-w-8 flex-1 self-stretch rounded-md" />
      <MinimizeWindowButton />
    </header>
  );
}
