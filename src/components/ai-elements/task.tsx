import { ChevronDownIcon, SearchIcon } from "lucide-react";
import type { ComponentProps, ReactElement } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type TaskItemFileProps = ComponentProps<"div">;

export function TaskItemFile({ children, className, ...props }: TaskItemFileProps): ReactElement {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border bg-secondary px-1.5 py-0.5 text-foreground text-xs",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type TaskItemProps = ComponentProps<"div">;

export function TaskItem({ children, className, ...props }: TaskItemProps): ReactElement {
  return (
    <div className={cn("text-muted-foreground text-sm", className)} {...props}>
      {children}
    </div>
  );
}

export type TaskProps = ComponentProps<typeof Collapsible>;

export function Task({ defaultOpen = true, className, ...props }: TaskProps): ReactElement {
  return <Collapsible className={cn(className)} defaultOpen={defaultOpen} {...props} />;
}

export type TaskTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  readonly title: string;
};

export function TaskTrigger({
  children,
  className,
  title,
  ...props
}: TaskTriggerProps): ReactElement {
  if (children !== undefined) {
    return (
      <CollapsibleTrigger asChild className={cn("group", className)} {...props}>
        {children}
      </CollapsibleTrigger>
    );
  }

  return (
    <CollapsibleTrigger
      className={cn(
        "group flex w-full cursor-pointer items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
        className,
      )}
      {...props}
    >
      <SearchIcon className="size-4" />
      <span className="text-sm">{title}</span>
      <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
}

export type TaskContentProps = ComponentProps<typeof CollapsibleContent>;

export function TaskContent({ children, className, ...props }: TaskContentProps): ReactElement {
  return (
    <CollapsibleContent
      className={cn(
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1 text-popover-foreground duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none data-[state=closed]:animate-out data-[state=open]:animate-in motion-reduce:animate-none",
        className,
      )}
      {...props}
    >
      <div className="mt-1.5 space-y-1.5 border-muted border-l pl-3">{children}</div>
    </CollapsibleContent>
  );
}
