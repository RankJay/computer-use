import { lazy, memo, Suspense, type ReactElement } from "react";

const ReasoningBundle = lazy(() =>
  import("@/components/ai-elements/reasoning").then((mod) => ({
    default: function ReasoningBundleInner({
      text,
      isStreaming,
    }: {
      text: string;
      isStreaming: boolean;
    }) {
      return (
        <mod.Reasoning isStreaming={isStreaming}>
          <mod.ReasoningTrigger />
          <mod.ReasoningContent>{text}</mod.ReasoningContent>
        </mod.Reasoning>
      );
    },
  })),
);

export type ReasoningPartProps = {
  readonly text: string;
  readonly isStreaming?: boolean;
};

export const ReasoningPart = memo(function ReasoningPart({
  text,
  isStreaming = false,
}: ReasoningPartProps): ReactElement {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground text-sm whitespace-pre-wrap">{text}</p>}
    >
      <ReasoningBundle text={text} isStreaming={isStreaming} />
    </Suspense>
  );
});
