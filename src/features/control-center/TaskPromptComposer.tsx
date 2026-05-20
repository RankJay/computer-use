import { ArrowUp } from "lucide-react";
import { useEffect, useRef } from "react";
import type { FormEvent, KeyboardEvent, ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type TaskPromptComposerProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly inputDisabled: boolean;
  readonly submitDisabled: boolean;
};

export function TaskPromptComposer(props: TaskPromptComposerProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    props.onSubmit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;

    e.preventDefault();
    if (props.inputDisabled || props.submitDisabled) return;

    props.onSubmit();
  }

  return (
    <form
      className="flex w-full items-center gap-1 rounded-3xl border-0 bg-[#161616] p-1.5 shadow-layered"
      onSubmit={handleSubmit}
    >
      <Textarea
        ref={textareaRef}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="How can I help you today?"
        disabled={props.inputDisabled}
        aria-label="Task"
        rows={1}
        className="field-sizing-content disabled:bg-transparent! h-auto max-h-[5lh] scrollbar-none min-h-0 flex-1 shrink resize-none overflow-y-auto border-0 bg-transparent py-1 pl-3 text-sm leading-normal text-white shadow-none outline-none placeholder:text-neutral-500 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent dark:shadow-none"
      />
      <Button
        type="submit"
        size="icon"
        disabled={props.submitDisabled}
        aria-label="Run task"
        className="shrink-0 self-end rounded-full border-0 bg-[#2b2b2b] text-white shadow-none hover:bg-[#363636] focus-visible:ring-2 focus-visible:ring-neutral-600 disabled:pointer-events-none disabled:bg-[#252525]"
      >
        <ArrowUp className="size-4" strokeWidth={3} />
      </Button>
    </form>
  );
}
