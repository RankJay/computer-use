export const COPIED_FEEDBACK_DURATION_MS = 2200;

export type NavigatorClipboardWriter = {
  readonly writeText: (text: string) => Promise<void>;
};

export type HiddenTextAreaHandle = {
  readonly select: () => void;
  readonly remove: () => void;
};

export type TextAreaClipboardFallback = {
  readonly createHiddenTextArea: (text: string) => HiddenTextAreaHandle;
  readonly copySelection: () => boolean;
};

export type TimeoutScheduler = {
  readonly setTimeout: (callback: () => void, delayMs: number) => number;
  readonly clearTimeout: (timeoutId: number) => void;
};

export type ClipboardAdapterDeps = {
  readonly clipboard?: NavigatorClipboardWriter;
  readonly clipboardFallback?: TextAreaClipboardFallback;
  readonly scheduler: TimeoutScheduler;
};

export type ClipboardAdapter = {
  readonly writeClipboardText: (text: string) => Promise<boolean>;
  readonly schedule: (callback: () => void, delayMs: number) => () => void;
};

export function createClipboardAdapter(deps: ClipboardAdapterDeps): ClipboardAdapter {
  return {
    async writeClipboardText(text) {
      if (deps.clipboard) {
        try {
          await deps.clipboard.writeText(text);
          return true;
        } catch {}
      }

      if (!deps.clipboardFallback) return false;

      let textArea: HiddenTextAreaHandle | null = null;

      try {
        textArea = deps.clipboardFallback.createHiddenTextArea(text);
        textArea.select();
        return deps.clipboardFallback.copySelection();
      } catch {
        return false;
      } finally {
        textArea?.remove();
      }
    },
    schedule(callback, delayMs) {
      const timeoutId = deps.scheduler.setTimeout(callback, delayMs);

      return () => {
        deps.scheduler.clearTimeout(timeoutId);
      };
    },
  };
}

function createDomClipboardFallback(): TextAreaClipboardFallback | undefined {
  if (typeof document === "undefined") return undefined;

  return {
    createHiddenTextArea(text) {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.append(textArea);
      return textArea;
    },
    copySelection() {
      return document.execCommand("copy");
    },
  };
}

export const clipboardAdapter = createClipboardAdapter({
  clipboard: typeof navigator === "undefined" ? undefined : navigator.clipboard,
  clipboardFallback: createDomClipboardFallback(),
  scheduler: {
    setTimeout(callback, delayMs) {
      return window.setTimeout(callback, delayMs);
    },
    clearTimeout(timeoutId) {
      window.clearTimeout(timeoutId);
    },
  },
});
