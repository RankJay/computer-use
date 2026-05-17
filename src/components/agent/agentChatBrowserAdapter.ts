export const COPIED_FEEDBACK_DURATION_MS = 2200;
export const STREAMING_ASSISTANT_COPY_ID = "assistant-stream";

export type AgentChatClipboardWriter = {
  readonly writeText: (text: string) => Promise<void>;
};

export type AgentChatInsertedTextArea = {
  readonly select: () => void;
  readonly remove: () => void;
};

export type AgentChatClipboardDocument = {
  readonly createHiddenTextArea: (text: string) => AgentChatInsertedTextArea;
  readonly copySelection: () => boolean;
};

export type AgentChatScheduler = {
  readonly setTimeout: (callback: () => void, delayMs: number) => number;
  readonly clearTimeout: (timeoutId: number) => void;
};

export type AgentChatBrowserEnvironment = {
  readonly clipboard?: AgentChatClipboardWriter;
  readonly clipboardDocument?: AgentChatClipboardDocument;
  readonly scheduler: AgentChatScheduler;
};

export type AgentChatBrowserAdapter = {
  readonly writeClipboardText: (text: string) => Promise<boolean>;
  readonly schedule: (callback: () => void, delayMs: number) => () => void;
};

export function createAgentChatBrowserAdapter(
  environment: AgentChatBrowserEnvironment,
): AgentChatBrowserAdapter {
  return {
    async writeClipboardText(text) {
      if (environment.clipboard) {
        try {
          await environment.clipboard.writeText(text);
          return true;
        } catch {
          // Fall through to the textarea copy path for browsers with blocked clipboard access.
        }
      }

      if (!environment.clipboardDocument) return false;

      let textArea: AgentChatInsertedTextArea | null = null;

      try {
        textArea = environment.clipboardDocument.createHiddenTextArea(text);
        textArea.select();
        return environment.clipboardDocument.copySelection();
      } catch {
        return false;
      } finally {
        textArea?.remove();
      }
    },
    schedule(callback, delayMs) {
      const timeoutId = environment.scheduler.setTimeout(callback, delayMs);

      return () => {
        environment.scheduler.clearTimeout(timeoutId);
      };
    },
  };
}

function createBrowserClipboardDocument(): AgentChatClipboardDocument | undefined {
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

export const agentChatBrowserAdapter = createAgentChatBrowserAdapter({
  clipboard: typeof navigator === "undefined" ? undefined : navigator.clipboard,
  clipboardDocument: createBrowserClipboardDocument(),
  scheduler: {
    setTimeout(callback, delayMs) {
      return window.setTimeout(callback, delayMs);
    },
    clearTimeout(timeoutId) {
      window.clearTimeout(timeoutId);
    },
  },
});
