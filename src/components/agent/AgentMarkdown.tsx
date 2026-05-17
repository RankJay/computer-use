import type { ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-3 text-inherit last:mb-0 wrap-break-word [&:has(+blockquote)]:mb-2">
      {children}
    </p>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 last:my-2">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 last:my-2">{children}</ol>,
  li: ({ children }) => <li className="text-inherit leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-neutral-600 py-1 pl-4 italic text-neutral-400">
      {children}
    </blockquote>
  ),
  h1: ({ children }) => (
    <h1 className="mt-6 mb-2 text-xl font-semibold text-inherit first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 border-b border-white/10 pb-1 text-lg font-semibold text-inherit first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-2 text-[15px] font-semibold text-inherit first:mt-0">{children}</h3>
  ),
  hr: () => <hr className="my-6 border-neutral-700" />,
  table: ({ children }) => (
    <div className="my-4 w-full overflow-x-auto">
      <table className="w-full border-collapse rounded-lg border border-neutral-700/80 text-left text-[13px]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-neutral-900/70">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-neutral-700/70">{children}</tbody>,
  tr: ({ children }) => <tr className="[&>td]:border-neutral-700/50">{children}</tr>,
  th: ({ children }) => (
    <th className="border border-neutral-700/60 px-3 py-2 font-medium text-neutral-200">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-neutral-700/60 px-3 py-2 text-neutral-400">{children}</td>
  ),
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-xl border border-neutral-700/80 bg-[#151515] p-4 text-[13px] leading-relaxed last:mb-0">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const isFence = typeof className === "string" && /\blanguage-/.test(className);
    if (!isFence) {
      return (
        <code className="rounded-md bg-neutral-800/90 px-1.5 py-0.5 text-[0.875em] text-neutral-100">
          {children}
        </code>
      );
    }
    return <code className={className}>{children}</code>;
  },
};

const remarkPlugins = [remarkGfm];

type AgentMarkdownProps = {
  readonly markdown: string;
};

export function AgentMarkdown({ markdown }: AgentMarkdownProps): ReactElement | null {
  if (markdown.trim() === "") return null;

  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
      {markdown}
    </ReactMarkdown>
  );
}
