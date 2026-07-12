import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowUp, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, ReactElement, SubmitEvent } from "react";

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
import { Anthropic } from "@/components/icons/anthropic";
import { OpenAI } from "@/components/icons/openai";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getAvailableAgentModels } from "@/lib/agent-models";

import type { ComposerContextUsage } from "./hooks/use-agent-session";

export type TaskPromptComposerProps = {
  readonly onSubmit: (prompt: string) => void;
  readonly onCancel: () => void;
  readonly onRetry?: () => void;
  readonly inputDisabled: boolean;
  readonly cancelVisible: boolean;
  readonly canRetry?: boolean;
  readonly modelId: string;
  readonly onModelChange: (modelId: string) => void;
  readonly contextUsage: ComposerContextUsage;
};

export function TaskPromptComposer(props: TaskPromptComposerProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const models = getAvailableAgentModels();
  const anthropicModels = models.filter((model) => model.provider === "Anthropic");
  const openAiModels = models.filter((model) => model.provider === "OpenAI");

  useEffect(() => {
    const focus = () => textareaRef.current?.focus();
    focus();

    const listening = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) focus();
    });

    return () => {
      void listening.then((unlisten) => unlisten());
    };
  }, []);

  function readPrompt(): string {
    return textareaRef.current?.value ?? "";
  }

  function clearPrompt(): void {
    const el = textareaRef.current;
    if (!el) return;
    el.value = "";
    setCanSubmit(false);
  }

  function submitPrompt(): void {
    if (props.inputDisabled || !canSubmit) return;
    const prompt = readPrompt();
    if (prompt.trim().length === 0) return;
    clearPrompt();
    props.onSubmit(prompt);
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>): void {
    e.preventDefault();
    submitPrompt();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;

    e.preventDefault();
    submitPrompt();
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>): void {
    setCanSubmit(e.target.value.trim().length > 0);
  }

  return (
    <form
      className="flex w-full flex-col gap-2 rounded-3xl bg-[#141414] p-2 pt-3 shadow-layered"
      onSubmit={handleSubmit}
    >
      <Textarea
        ref={textareaRef}
        defaultValue=""
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="How can I help you today?"
        disabled={props.inputDisabled}
        aria-label="Task"
        rows={1}
        className="field-sizing-content disabled:bg-transparent! h-auto max-h-[5lh] scrollbar-none min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent px-1 py-1 text-sm leading-normal text-white shadow-none outline-none placeholder:text-neutral-500 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent dark:shadow-none"
      />

      <div className="flex items-center justify-between gap-2">
        <Select
          items={models.map((model) => ({ label: model.name, value: model.id }))}
          value={props.modelId}
          onValueChange={(value) => {
            if (value !== null) props.onModelChange(value);
          }}
        >
          <SelectTrigger className="h-7 w-auto min-w-0 max-w-[min(100%,14rem)] rounded-full border-0 bg-transparent text-xs text-[#CDCDCD] shadow-none hover:bg-[#252525]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" className="p-0.5 w-52! bg-[#161616] text-[#CDCDCD]">
            <SelectGroup className="p-0">
              <SelectLabel className="px-1.5 py-1 text-[10px] font-medium tracking-wide text-[#767676]">
                Anthropic
              </SelectLabel>
              {anthropicModels.map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  className="flex gap-2 items-center w-full"
                >
                  <Anthropic className="size-3 flex self-center items-center" />
                  <span>{model.name}</span>
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup className="p-0">
              <SelectLabel className="px-1.5 py-1 text-[10px] font-medium tracking-wide text-[#767676]">
                OpenAI
              </SelectLabel>
              {openAiModels.map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  className="flex gap-2 items-center w-full"
                >
                  <OpenAI className="size-3 flex self-center items-center" />
                  <span>{model.name}</span>
                </SelectItem>
              ))}
            </SelectGroup>
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

          {props.canRetry && props.onRetry ? (
            <Button
              type="button"
              size="icon"
              aria-label="Retry task"
              onClick={props.onRetry}
              className="size-7 shrink-0 rounded-full border-0 bg-[#2b2b2b] text-white shadow-none hover:bg-[#363636] focus-visible:ring-2 focus-visible:ring-neutral-600"
            >
              <RotateCcw className="size-3.5" strokeWidth={2.5} />
            </Button>
          ) : null}
          <Button
            type={props.cancelVisible ? "button" : "submit"}
            size="icon"
            disabled={!props.cancelVisible && (!canSubmit || props.inputDisabled)}
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
