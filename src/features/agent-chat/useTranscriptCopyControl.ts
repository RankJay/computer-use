import { useCallback, useEffect, useRef, useState } from "react";

import {
  clipboardAdapter,
  COPIED_FEEDBACK_DURATION_MS,
} from "@/features/agent-chat/clipboardAdapter";

export type TranscriptCopyControl = {
  readonly isCopied: boolean;
  readonly isCopyDisabled: boolean;
  readonly onCopy: () => void;
};

export function useTranscriptCopyControl(): (
  copyId: string,
  text: string,
) => TranscriptCopyControl {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const resetCopiedStatusRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      resetCopiedStatusRef.current?.();
    };
  }, []);

  const resetCopiedStatusLater = useCallback((copyId: string) => {
    resetCopiedStatusRef.current?.();
    resetCopiedStatusRef.current = clipboardAdapter.schedule(() => {
      resetCopiedStatusRef.current = null;
      setCopiedMessageId((currentCopyId) => (currentCopyId === copyId ? null : currentCopyId));
    }, COPIED_FEEDBACK_DURATION_MS);
  }, []);

  const copyResponse = useCallback(
    async (copyId: string, text: string) => {
      if (text.trim().length === 0) return;

      const copied = await clipboardAdapter.writeClipboardText(text);
      if (!copied) return;

      setCopiedMessageId(copyId);
      resetCopiedStatusLater(copyId);
    },
    [resetCopiedStatusLater],
  );

  return useCallback(
    (copyId: string, text: string): TranscriptCopyControl => ({
      isCopied: copiedMessageId === copyId,
      isCopyDisabled: text.trim().length === 0,
      onCopy: () => {
        void copyResponse(copyId, text);
      },
    }),
    [copiedMessageId, copyResponse],
  );
}
