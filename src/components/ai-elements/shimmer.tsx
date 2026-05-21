import type { MotionProps } from "motion/react";
import { motion } from "motion/react";
import type { CSSProperties, ComponentType, ReactElement } from "react";
import { memo, useMemo } from "react";

import { cn } from "@/lib/utils";

type ShimmerElement = "p" | "span";
type MotionHTMLProps = MotionProps & {
  readonly children?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
};

const motionComponents = {
  p: motion.p,
  span: motion.span,
} satisfies Record<ShimmerElement, ComponentType<MotionHTMLProps>>;

export type ShimmerProps = {
  readonly children: string;
  readonly as?: ShimmerElement;
  readonly className?: string;
  readonly duration?: number;
  readonly spread?: number;
};

const ShimmerComponent = ({
  children,
  as = "p",
  className,
  duration = 2,
  spread = 2,
}: ShimmerProps): ReactElement => {
  const MotionComponent = motionComponents[as];
  const dynamicSpread = useMemo(() => children.length * spread, [children, spread]);
  const style: CSSProperties & { readonly "--spread": string } = {
    "--spread": `${dynamicSpread}px`,
    backgroundImage:
      "var(--bg), linear-gradient(var(--shimmer-base, var(--color-muted-foreground)), var(--shimmer-base, var(--color-muted-foreground)))",
  };

  return (
    <MotionComponent
      animate={{ backgroundPosition: "0% center" }}
      className={cn(
        "relative inline-block bg-size-[250%_100%,auto] bg-clip-text text-transparent",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--shimmer-highlight,var(--color-background)),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        className,
      )}
      initial={{ backgroundPosition: "100% center" }}
      style={style}
      transition={{
        duration,
        ease: "linear",
        repeat: Number.POSITIVE_INFINITY,
      }}
    >
      {children}
    </MotionComponent>
  );
};

export const Shimmer = memo(ShimmerComponent);
