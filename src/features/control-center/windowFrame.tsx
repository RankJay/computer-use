import { isTauriRuntime } from "@/agent/native/nativeBridge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minimize2 } from "lucide-react";
import type { MouseEvent, ReactElement } from "react";
import { useCallback } from "react";

async function minimizeActuateWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  await getCurrentWindow().minimize();
}

function onTitleBarDragMouseDown(e: MouseEvent): void {
  if (!isTauriRuntime()) return;
  if (e.button !== 0) return;
  void getCurrentWindow().startDragging();
}

export function TitleBarDragRegion(props: { className?: string }): ReactElement {
  return (
    <div
      data-tauri-drag-region
      role="presentation"
      onMouseDown={onTitleBarDragMouseDown}
      className={cn(
        "cursor-grab rounded-lg active:cursor-grabbing [-webkit-app-region:drag]",
        props.className,
      )}
    />
  );
}

export function MinimizeWindowButton(): ReactElement {
  const handleMinimizeClick = useCallback((): void => {
    void minimizeActuateWindow();
  }, []);

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-8 bg-transparent hover:bg-transparent cursor-pointer shrink-0 group [-webkit-app-region:no-drag]"
      aria-label="Minimize to taskbar"
      title="Minimize (app keeps running; use the tray menu to exit)"
      onClick={handleMinimizeClick}
    >
      <Minimize2
        className="size-4 text-[#3F3F3F] group-hover:text-[#9c9c9c] transition-colors"
        strokeWidth={2.5}
      />
    </Button>
  );
}
