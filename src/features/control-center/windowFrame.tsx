import { isTauriRuntime } from "@/agent/native/nativeBridge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minimize2 } from "lucide-react";
import type { ComponentProps, MouseEvent, ReactElement } from "react";
import { useCallback } from "react";

/** Title-bar icon controls: no bg hover, no click shift — feedback on the SVG only. */
export const chromeIconButtonClassName =
  "size-8 shrink-0 cursor-pointer group [-webkit-app-region:no-drag]";

export const chromeIconSvgClassName =
  "size-4 text-[#3F3F3F] transition-[color,transform] duration-150 group-hover:text-[#9c9c9c] group-active:scale-[0.88] group-active:text-[#aeaeae]";

export function ChromeIconButton({
  className,
  ...props
}: ComponentProps<typeof Button>): ReactElement {
  return (
    <Button
      type="button"
      size="icon"
      variant="chromeIcon"
      className={cn(chromeIconButtonClassName, className)}
      {...props}
    />
  );
}

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
    <ChromeIconButton
      aria-label="Minimize to taskbar"
      title="Minimize (app keeps running; use the tray menu to exit)"
      onClick={handleMinimizeClick}
    >
      <Minimize2 className={chromeIconSvgClassName} strokeWidth={2.5} />
    </ChromeIconButton>
  );
}
