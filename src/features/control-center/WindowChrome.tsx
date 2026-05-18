import { isTauriRuntime } from "@/agent/native/nativeBridge";
import { SettingsSheet } from "@/features/settings/SettingsSheet";
import { Button } from "@/components/ui/button";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minimize2 } from "lucide-react";
import type { MouseEvent, ReactElement } from "react";
import { useCallback } from "react";

export type WindowChromeProps = {
  readonly onResetSession: () => void;
};

async function minimizeActuateWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  await getCurrentWindow().minimize();
}

function onWindowDragMouseDown(e: MouseEvent): void {
  if (!isTauriRuntime()) return;
  if (e.button !== 0) return;
  void getCurrentWindow().startDragging();
}

export function WindowChrome(props: WindowChromeProps): ReactElement {
  const handleMinimizeClick = useCallback((): void => {
    void minimizeActuateWindow();
  }, []);

  return (
    <div className="relative flex min-h-[44px] shrink-0 select-none items-center justify-between gap-3 px-2">
      <div
        data-tauri-drag-region
        role="presentation"
        onMouseDown={onWindowDragMouseDown}
        className="flex w-fit max-w-[min(100%,16rem)] cursor-grab items-center rounded-lg px-2 active:cursor-grabbing [-webkit-app-region:drag]"
      />
      <div className="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
        <SettingsSheet onResetSession={props.onResetSession} />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 bg-transparent hover:bg-transparent cursor-pointer shrink-0 group"
          aria-label="Minimize to taskbar"
          title="Minimize (app keeps running; use the tray menu to exit)"
          onClick={handleMinimizeClick}
        >
          <Minimize2
            className="size-4 text-[#3F3F3F] group-hover:text-[#9c9c9c] transition-colors"
            strokeWidth={2.5}
          />
        </Button>
      </div>
    </div>
  );
}
