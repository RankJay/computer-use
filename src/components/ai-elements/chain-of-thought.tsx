"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import type { LucideIcon } from "lucide-react";
import { BrainIcon, ChevronDownIcon, DotIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext, useMemo } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ChainOfThoughtContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(null);

const useChainOfThought = () => {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error("ChainOfThought components must be used within ChainOfThought");
  }
  return context;
};

export type ChainOfThoughtProps = ComponentProps<"div"> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const ChainOfThought = memo(
  ({
    className,
    open,
    defaultOpen = false,
    onOpenChange,
    children,
    ...props
  }: ChainOfThoughtProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      defaultProp: defaultOpen,
      onChange: onOpenChange,
      prop: open,
    });

    const chainOfThoughtContext = useMemo(() => ({ isOpen, setIsOpen }), [isOpen, setIsOpen]);

    return (
      <ChainOfThoughtContext.Provider value={chainOfThoughtContext}>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className={cn("not-prose w-full space-y-2", className)} {...props}>
            {children}
          </div>
        </Collapsible>
      </ChainOfThoughtContext.Provider>
    );
  },
);

export type ChainOfThoughtHeaderProps = ComponentProps<typeof CollapsibleTrigger>;

export const ChainOfThoughtHeader = memo(
  ({ className, children, ...props }: ChainOfThoughtHeaderProps) => {
    const { isOpen } = useChainOfThought();

    return (
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-1.5 text-muted-foreground text-sm transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-foreground motion-reduce:transition-none",
          className,
        )}
        {...props}
      >
        <BrainIcon className="size-3.5 shrink-0" />
        <span className="flex-1 text-left leading-snug">{children ?? "Behind the scenes"}</span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
            isOpen ? "rotate-180" : "rotate-0",
          )}
        />
      </CollapsibleTrigger>
    );
  },
);

export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  status?: "complete" | "active" | "pending";
};

const stepStatusStyles = {
  active: "text-foreground",
  complete: "text-muted-foreground",
  pending: "text-muted-foreground/50",
};

export const ChainOfThoughtStep = memo(
  ({
    className,
    icon: Icon = DotIcon,
    label,
    description,
    status = "complete",
    children,
    ...props
  }: ChainOfThoughtStepProps) => (
    <div
      className={cn(
        "flex gap-1.5 text-sm leading-snug",
        stepStatusStyles[status],
        "fade-in-0 slide-in-from-top-1 animate-in duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none",
        className,
      )}
      {...props}
    >
      <div className="relative mt-px">
        <Icon className="size-3.5 shrink-0" />
        <div className="absolute top-5 bottom-0 left-1/2 -mx-px w-px bg-border" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5 overflow-hidden">
        <div className="text-xs font-medium">{label}</div>
        {description && (
          <div className="text-muted-foreground text-xs leading-snug">{description}</div>
        )}
        {children}
      </div>
    </div>
  ),
);

export type ChainOfThoughtContentProps = ComponentProps<typeof CollapsibleContent>;

export const ChainOfThoughtContent = memo(
  ({ className, children, ...props }: ChainOfThoughtContentProps) => (
    <CollapsibleContent
      className={cn(
        "mt-1 space-y-1.5",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1 text-popover-foreground duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none data-[state=closed]:animate-out data-[state=open]:animate-in motion-reduce:animate-none",
        className,
      )}
      {...props}
    >
      {children}
    </CollapsibleContent>
  ),
);

ChainOfThought.displayName = "ChainOfThought";
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";
ChainOfThoughtStep.displayName = "ChainOfThoughtStep";
ChainOfThoughtContent.displayName = "ChainOfThoughtContent";
