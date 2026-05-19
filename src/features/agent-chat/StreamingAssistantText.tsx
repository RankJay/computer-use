import { useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { motion } from "motion/react";
import { joinStreamingText } from "@/agent/session/streamingTextJoin";

type TextSegment = {
  readonly id: number;
  readonly text: string;
};

const segmentEase = [0.22, 1, 0.36, 1] as const;

function StreamingTextSegment(props: { readonly text: string }): ReactElement {
  return (
    <motion.span
      initial={{ opacity: 0.4, y: 2, filter: "blur(3px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.79, ease: segmentEase }}
    >
      {props.text}
    </motion.span>
  );
}

export function StreamingAssistantText(props: { readonly text: string }): ReactElement | null {
  const nextIdRef = useRef(0);
  const committedLengthRef = useRef(0);
  const [segments, setSegments] = useState<readonly TextSegment[]>([]);

  useLayoutEffect(() => {
    const committed = committedLengthRef.current;

    if (textShrunk(props.text, committed)) {
      nextIdRef.current = 0;
      committedLengthRef.current = 0;
      setSegments([]);
    }

    const nextCommitted = committedLengthRef.current;
    if (props.text.length <= nextCommitted) return;

    const previous = props.text.slice(0, nextCommitted);
    const rawDelta = props.text.slice(nextCommitted);
    const delta = joinStreamingText(previous, rawDelta).slice(previous.length);
    committedLengthRef.current = previous.length + delta.length;

    const id = nextIdRef.current;
    nextIdRef.current += 1;
    setSegments((prev) => [...prev, { id, text: delta }]);
  }, [props.text]);

  if (segments.length === 0 && props.text.length === 0) return null;

  return (
    <span className="whitespace-pre-wrap text-[#fefefe]">
      {segments.map((segment) => (
        <StreamingTextSegment key={segment.id} text={segment.text} />
      ))}
    </span>
  );
}

function textShrunk(text: string, committedLength: number): boolean {
  return text.length < committedLength;
}
