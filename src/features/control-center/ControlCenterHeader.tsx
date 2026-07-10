import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Settings } from "lucide-react";
import { useCallback, type ReactElement } from "react";
import { Link } from "react-router-dom";

const headerIconClassName =
  "size-4 text-[#3F3F3F] transition-[color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-[#9c9c9c] active:scale-[0.95] active:text-[#aeaeae] motion-reduce:transition-none";

export function ControlCenterHeader(): ReactElement {
  const minimize = useCallback(async (): Promise<void> => {
    await getCurrentWindow().minimize();
  }, []);

  return (
    <header className="flex relative min-h-[44px] shrink-0 select-none items-center justify-between px-3 py-4">
      <h1 className="text-base font-[450] shrink-0 tracking-tight text-[#eaeaea] [-webkit-app-region:no-drag]">
        Actuate
      </h1>
      <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
        <Link
          to="/settings"
          aria-label="Settings"
          className="inline-flex items-center justify-center rounded-md text-[#cdcdcd] transition-colors hover:text-white"
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
