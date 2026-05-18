import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp } from "lucide-react";
import type { FormEvent, ReactElement } from "react";

export type TaskPromptComposerProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly inputDisabled: boolean;
  readonly submitDisabled: boolean;
};

export function TaskPromptComposer(props: TaskPromptComposerProps): ReactElement {
  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    props.onSubmit();
  }

  return (
    <form
      className="flex w-full items-center gap-1 rounded-[9999px] border-0 bg-[#121212] p-1.5 shadow-layered"
      onSubmit={handleSubmit}
    >
      <Input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder="How can I help you today?"
        disabled={props.inputDisabled}
        aria-label="Task"
        className="h-auto bg-transparent min-h-0 flex-1 shrink border-0 pl-3 py-1 text-sm leading-normal text-white shadow-none outline-none placeholder:text-neutral-500 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent dark:shadow-none disabled:bg-transparent disabled:opacity-50"
      />
      <Button
        type="submit"
        size="icon"
        disabled={props.submitDisabled}
        aria-label="Run task"
        className=" shrink-0 rounded-full border-0 bg-[#2b2b2b] text-white shadow-none hover:bg-[#363636] focus-visible:ring-2 focus-visible:ring-neutral-600 disabled:pointer-events-none disabled:bg-[#252525]"
      >
        <ArrowUp className="size-4" strokeWidth={3} />
      </Button>
    </form>
  );
}
