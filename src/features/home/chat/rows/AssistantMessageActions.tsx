import { Check, Copy, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { MessageFooter } from "@/components/ui/message";

export type AssistantMessageActionsProps = {
  readonly markdown: string;
  readonly canRetry: boolean;
  readonly onRetry?: () => void;
};

export function AssistantMessageActions({
  markdown,
  canRetry,
  onRetry,
}: AssistantMessageActionsProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number>(0);

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const onCopy = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }
    if (copied || markdown.length === 0) {
      return;
    }
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      timeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can fail without permission; keep UI quiet.
    }
  }, [copied, markdown]);

  const CopyIcon = copied ? Check : Copy;

  return (
    <MessageFooter className="gap-0 px-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={copied ? "Copied" : "Copy answer"}
        onClick={() => {
          void onCopy();
        }}
        className="size-7 shrink-0 text-[#767676] hover:bg-[#252525] hover:text-[#CDCDCD]"
      >
        <CopyIcon className="size-3.5" strokeWidth={2.5} />
      </Button>
      {canRetry && onRetry ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Retry answer"
          onClick={onRetry}
          className="size-7 shrink-0 text-[#767676] hover:bg-[#252525] hover:text-[#CDCDCD]"
        >
          <RotateCcw className="size-3.5" strokeWidth={2.5} />
        </Button>
      ) : null}
    </MessageFooter>
  );
}
