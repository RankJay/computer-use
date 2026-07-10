"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { memo } from "react";
import { Streamdown } from "streamdown";

import { cn } from "@/lib/utils";

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { cjk, code, math, mermaid };

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        // Streamdown defaults to list-inside; marker→text gap differs for disc vs decimal.
        // list-outside + pl-1 on items keeps that gap consistent across both list types.
        "**:data-[streamdown=unordered-list]:list-outside **:data-[streamdown=ordered-list]:list-outside",
        "**:data-[streamdown=unordered-list]:pl-5 **:data-[streamdown=ordered-list]:pl-5",
        "**:data-[streamdown=list-item]:pl-1",
        className,
      )}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children && nextProps.isAnimating === prevProps.isAnimating,
);

MessageResponse.displayName = "MessageResponse";
