import { getCurrentWindow } from "@tauri-apps/api/window";
import { History, Minus, PlusCircle, Settings } from "lucide-react";
import { useCallback, type ReactElement } from "react";
import { Link } from "react-router-dom";

import { queryClient } from "@/app/query-client";
import { settingsQueryOptions } from "@/lib/settings/queries";

const headerIconClassName =
  "size-4 text-[#3F3F3F] transition-[color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-[#9c9c9c] active:scale-[0.95] active:text-[#aeaeae] motion-reduce:transition-none";

const headerLinkClassName =
  "inline-flex items-center justify-center rounded-md text-[#cdcdcd] transition-colors hover:text-white aria-disabled:pointer-events-none aria-disabled:opacity-40";

type HomePageHeaderProps = {
  readonly navDisabled: boolean;
};

export function HomePageHeader({ navDisabled }: HomePageHeaderProps): ReactElement {
  const minimize = useCallback(async (): Promise<void> => {
    await getCurrentWindow().minimize();
  }, []);

  const prefetchSettings = useCallback((): void => {
    void queryClient.prefetchQuery(settingsQueryOptions());
  }, []);

  return (
    <header className="flex w-full relative shrink-0 select-none items-center justify-between p-4">
      <div className="flex items-baseline gap-2.5">
        <h1 className="text-base font-[450] shrink-0 tracking-tight text-foreground">Actuate</h1>
        <span className="text-[13px] text-foreground/50">0.1.0</span>
      </div>
      <div className="flex items-center gap-4">
        <Link
          to="/"
          aria-label="New chat"
          aria-disabled={navDisabled}
          tabIndex={navDisabled ? -1 : undefined}
          onClick={(event) => {
            if (navDisabled) event.preventDefault();
          }}
          className={headerLinkClassName}
        >
          <PlusCircle className={headerIconClassName} />
        </Link>
        <Link
          to="/history"
          aria-label="History"
          aria-disabled={navDisabled}
          tabIndex={navDisabled ? -1 : undefined}
          onClick={(event) => {
            if (navDisabled) event.preventDefault();
          }}
          className={headerLinkClassName}
        >
          <History className={headerIconClassName} />
        </Link>
        <Link
          to="/settings"
          aria-label="Settings"
          onMouseEnter={prefetchSettings}
          onFocus={prefetchSettings}
          className={headerLinkClassName}
        >
          <Settings className={headerIconClassName} />
        </Link>
        <button
          type="button"
          aria-label="Minimize"
          onClick={minimize}
          className="inline-flex items-center justify-center rounded-md text-[#cdcdcd] transition-colors hover:text-white"
        >
          <Minus className={headerIconClassName} />
        </button>
      </div>
    </header>
  );
}
