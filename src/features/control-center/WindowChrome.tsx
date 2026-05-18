import { Button } from "@/components/ui/button";
import { MinimizeWindowButton, TitleBarDragRegion } from "@/features/control-center/windowFrame";
import { Settings2 } from "lucide-react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";

const settingsLinkButtonClassName =
  "size-8 bg-transparent hover:bg-transparent shrink-0 group cursor-pointer [-webkit-app-region:no-drag]";

export function WindowChrome(): ReactElement {
  return (
    <div className="relative flex min-h-[44px] shrink-0 select-none items-center justify-between gap-3 px-2">
      <TitleBarDragRegion className="flex w-fit max-w-[min(100%,16rem)] items-center px-2" />
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={settingsLinkButtonClassName}
          asChild
        >
          <Link to="/settings" aria-label="Open settings">
            <Settings2
              className="size-4 text-[#3F3F3F] group-hover:text-[#9c9c9c] transition-colors"
              strokeWidth={2}
            />
          </Link>
        </Button>
        <MinimizeWindowButton />
      </div>
    </div>
  );
}
