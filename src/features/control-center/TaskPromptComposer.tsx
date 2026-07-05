import type { LanguageModelUsage } from "ai";
import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactElement, SubmitEvent } from "react";

import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "@/components/ai-elements/context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AgentModelOption } from "@/lib/agent-models";

export type TaskPromptComposerContextUsage = {
  readonly usedTokens: number;
  readonly maxTokens: number;
  readonly modelId: string;
  readonly usage: LanguageModelUsage;
};

export type TaskPromptComposerProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly inputDisabled: boolean;
  readonly submitDisabled: boolean;
  readonly cancelVisible: boolean;
  readonly modelId: string;
  readonly onModelChange: (modelId: string) => void;
  readonly models: readonly AgentModelOption[];
  readonly contextUsage: TaskPromptComposerContextUsage;
};

export function TaskPromptComposer(props: TaskPromptComposerProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleSubmit(e: SubmitEvent<HTMLFormElement>): void {
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
      className="flex w-full flex-col gap-2 rounded-3xl bg-[#161616] p-2 shadow-layered"
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
        className="field-sizing-content disabled:bg-transparent! h-auto max-h-[5lh] scrollbar-none min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent px-1 py-1 text-sm leading-normal text-white shadow-none outline-none placeholder:text-neutral-500 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent dark:shadow-none"
      />

      <div className="flex items-center justify-between gap-2">
        <Select
          onValueChange={(value) => {
            if (value) props.onModelChange(value);
          }}
          value={props.modelId}
        >
          <SelectTrigger className="h-7 w-auto min-w-0 max-w-[min(100%,14rem)] rounded-full border-0 bg-transparent text-xs text-[#CDCDCD] shadow-none hover:bg-[#252525]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" className="p-0.5 bg-[#161616] text-[#CDCDCD]">
            {props.models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex shrink-0 items-center gap-0.5">
          <Context
            maxTokens={props.contextUsage.maxTokens}
            modelId={props.contextUsage.modelId}
            usage={props.contextUsage.usage}
            usedTokens={props.contextUsage.usedTokens}
          >
            <ContextTrigger className="h-7 px-1.5 text-xs text-[#767676] hover:bg-[#252525] hover:text-[#CDCDCD]" />
            <ContextContent align="end" className="border-[#252525] bg-[#161616] text-[#CDCDCD]">
              <ContextContentHeader />
              <ContextContentBody className="space-y-2">
                <ContextInputUsage />
                <ContextOutputUsage />
                <ContextReasoningUsage />
                <ContextCacheUsage />
              </ContextContentBody>
              <ContextContentFooter />
            </ContextContent>
          </Context>

          <Button
            type={props.cancelVisible ? "button" : "submit"}
            size="icon"
            disabled={!props.cancelVisible && props.submitDisabled}
            aria-label={props.cancelVisible ? "Stop task" : "Run task"}
            onClick={props.cancelVisible ? props.onCancel : undefined}
            className={
              props.cancelVisible
                ? "size-7 shrink-0 rounded-full border-0 cursor-pointer bg-[#cdcdcd] text-white shadow-none hover:bg-[#cdcdcd] focus-visible:ring-2 focus-visible:ring-neutral-600"
                : "size-7 shrink-0 rounded-full border-0 bg-[#2b2b2b] text-white shadow-none hover:bg-[#363636] focus-visible:ring-2 focus-visible:ring-neutral-600 disabled:pointer-events-none disabled:bg-[#252525]"
            }
          >
            {props.cancelVisible ? (
              <Square className="size-3" fill="#161616" stroke="#161616" strokeWidth={3} />
            ) : (
              <ArrowUp className="size-3.5" strokeWidth={3} />
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
