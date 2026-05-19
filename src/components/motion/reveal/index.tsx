"use client";

import { AnimatePresence, motion } from "motion/react";

const blockTransition = {
  type: "spring",
  stiffness: 140,
  damping: 22,
  mass: 1.1,
} as const;

const contentEase = [0.22, 1, 0.36, 1] as const;

function Presence({ children }: React.PropsWithChildren): React.ReactElement {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}

function Block({ children, className }: React.HTMLProps<HTMLDivElement>): React.ReactElement {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
      transition={blockTransition}
    >
      {children}
    </motion.div>
  );
}

function Content({ children, className }: React.HTMLProps<HTMLDivElement>): React.ReactElement {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0.72, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: contentEase }}
      style={{ transformOrigin: "top left" }}
    >
      {children}
    </motion.div>
  );
}

function Trail({ children, className }: React.HTMLProps<HTMLDivElement>): React.ReactElement {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.28, ease: contentEase }}
    >
      {children}
    </motion.div>
  );
}

export { Block, Content, Presence, Trail };
