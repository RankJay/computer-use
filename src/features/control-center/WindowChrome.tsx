import { Settings2 } from "lucide-react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import {
  ChromeIconButton,
  chromeIconSvgClassName,
  MinimizeWindowButton,
  TitleBarDragRegion,
} from "@/features/control-center/windowFrame";

export function WindowChrome(): ReactElement {
  return (
    <div className="relative flex min-h-[44px] shrink-0 select-none items-center justify-between gap-3 px-2">
      <TitleBarDragRegion className="flex w-fit max-w-[min(100%,16rem)] items-center px-2" />
      <div className="flex shrink-0 items-center gap-1">
        <ChromeIconButton asChild>
          <Link to="/settings" aria-label="Open settings">
            <Settings2 className={chromeIconSvgClassName} strokeWidth={2} />
          </Link>
        </ChromeIconButton>
        <MinimizeWindowButton />
      </div>
    </div>
  );
}
