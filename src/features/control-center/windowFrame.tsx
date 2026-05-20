import { Minimize2 } from "lucide-react";
import type { ComponentProps, MouseEvent, ReactElement } from "react";
import { useCallback } from "react";

import { minimizeActuateWindow, startActuateWindowDrag } from "@/agent/native/nativeBridge";
import { Button } from "@/components/ui/button";
import {
  chromeIconButtonClassName,
  chromeIconSvgClassName,
} from "@/features/control-center/windowFrameStyles";
import { cn } from "@/lib/utils";

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

function onTitleBarDragMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return;
  startActuateWindowDrag();
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
