import type { ReactElement } from "react";
import { Streamdown } from "streamdown";
import { agentMarkdownComponents } from "@/features/agent-chat/agentMarkdownComponents";

type AgentStreamMarkdownProps = {
  readonly markdown: string;
  readonly isStreaming: boolean;
};

/**
 * Single markdown pipeline for assistant text: streaming and complete.
 * Uses Streamdown block memoization instead of ad-hoc segment animations.
 */
export function AgentStreamMarkdown(props: AgentStreamMarkdownProps): ReactElement | null {
  if (props.markdown.trim() === "") return null;

  return (
    <Streamdown
      className="agent-stream-markdown text-inherit"
      mode={props.isStreaming ? "streaming" : "static"}
      isAnimating={props.isStreaming}
      animated={false}
      lineNumbers={false}
      controls={{ code: false, mermaid: false, table: false }}
      shikiTheme={["github-dark", "github-dark"]}
      components={agentMarkdownComponents}
    >
      {props.markdown}
    </Streamdown>
  );
}
