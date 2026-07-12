"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";

const easeOut = [0.23, 1, 0.32, 1] as const;

const container: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.08,
    },
  },
};

const item: Variants = {
  hidden: {
    opacity: 0,
    transform: "translateY(12px) scale(0.98)",
    filter: "blur(6px)",
  },
  show: {
    opacity: 1,
    transform: "translateY(0px) scale(1)",
    filter: "blur(0px)",
    transition: {
      duration: 0.42,
      ease: easeOut,
    },
  },
};

function Container({ children, className }: React.HTMLProps<HTMLDivElement>) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={container}
      initial={shouldReduceMotion ? false : "hidden"}
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Item({ children, className }: React.HTMLProps<HTMLDivElement>) {
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}

export { Container, Item };
