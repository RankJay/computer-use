import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/runtime/query-client";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallbackTitle: string;
  fallbackDescription?: string;
  onRetry?: () => void;
  resetKeys?: readonly unknown[];
  variant?: "route" | "section";
};

type ErrorBoundaryState = {
  error: Error | null;
  resetKeys: readonly unknown[] | undefined;
};

function errorMessage(error: Error): string {
  return error.message.trim().length > 0 ? error.message : "An unexpected error occurred.";
}

function resetKeysChanged(
  prev: readonly unknown[] | undefined,
  next: readonly unknown[] | undefined,
): boolean {
  if (prev === next) {
    return false;
  }
  if (prev === undefined || next === undefined) {
    return prev !== next;
  }
  return prev.length !== next.length || next.some((key, index) => key !== prev[index]);
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKeys: undefined };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (!resetKeysChanged(state.resetKeys, props.resetKeys)) {
      return null;
    }
    if (state.error !== null) {
      return { error: null, resetKeys: props.resetKeys };
    }
    return { resetKeys: props.resetKeys };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    toast.error(this.props.fallbackTitle, {
      description: errorMessage(error),
    });
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.props.onRetry?.();
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }

    const { fallbackTitle, fallbackDescription, variant = "section" } = this.props;
    const description = fallbackDescription ?? errorMessage(error);

    if (variant === "route") {
      return (
        <main className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-white">
          <div className="flex max-w-md flex-col gap-2">
            <h1 className="text-lg font-medium text-foreground">{fallbackTitle}</h1>
            <p className="text-sm text-[#767676]">{description}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={this.handleRetry}>
              Try again
            </Button>
            <Link
              to="/"
              className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium text-foreground transition-all hover:bg-muted"
            >
              Back to home
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Reload app
            </Button>
          </div>
        </main>
      );
    }

    return (
      <div className="flex flex-col gap-3 rounded-xl bg-[#141414] p-4 text-foreground shadow-layered">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">{fallbackTitle}</h2>
          <p className="text-[13px] leading-4 text-[#767676]">{description}</p>
        </div>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={this.handleRetry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
}

export function RouteErrorBoundary(props: {
  children: ReactNode;
  resetKeys?: readonly unknown[];
}): ReactNode {
  return (
    <ErrorBoundary
      variant="route"
      fallbackTitle="This page failed to load"
      fallbackDescription="Something went wrong while loading this page."
      resetKeys={props.resetKeys}
    >
      {props.children}
    </ErrorBoundary>
  );
}

export function SectionErrorBoundary(props: {
  children: ReactNode;
  fallbackTitle: string;
  fallbackDescription?: string;
  onRetry?: () => void;
  resetKeys?: readonly unknown[];
}): ReactNode {
  return (
    <ErrorBoundary
      variant="section"
      fallbackTitle={props.fallbackTitle}
      fallbackDescription={props.fallbackDescription}
      onRetry={props.onRetry}
      resetKeys={props.resetKeys}
    >
      {props.children}
    </ErrorBoundary>
  );
}

/**
 * Suspense + section ErrorBoundary + TanStack Query error reset.
 * Retry clears the query error so useSuspenseQuery can re-suspend.
 */
export function SuspenseQueryBoundary(props: {
  children: ReactNode;
  fallback: ReactNode;
  fallbackTitle: string;
  fallbackDescription?: string;
  queryKey: readonly unknown[];
  resetKeys?: readonly unknown[];
}): ReactNode {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <SectionErrorBoundary
          fallbackTitle={props.fallbackTitle}
          fallbackDescription={props.fallbackDescription}
          resetKeys={props.resetKeys}
          onRetry={() => {
            reset();
            void queryClient.resetQueries({ queryKey: props.queryKey });
          }}
        >
          <Suspense fallback={props.fallback}>{props.children}</Suspense>
        </SectionErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
