import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

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
};

function errorMessage(error: Error): string {
  return error.message.trim().length > 0 ? error.message : "An unexpected error occurred.";
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    toast.error(this.props.fallbackTitle, {
      description: errorMessage(error),
    });
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    const { resetKeys } = this.props;
    if (this.state.error === null || resetKeys === undefined) {
      return;
    }

    const prevKeys = prevProps.resetKeys ?? [];
    const keysChanged =
      resetKeys.length !== prevKeys.length ||
      resetKeys.some((key, index) => key !== prevKeys[index]);

    if (keysChanged) {
      this.setState({ error: null });
    }
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
            <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
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

export function RouteErrorBoundary(props: { children: ReactNode }): ReactNode {
  return (
    <ErrorBoundary
      variant="route"
      fallbackTitle="This page failed to load"
      fallbackDescription="Something went wrong while loading this page."
    >
      {props.children}
    </ErrorBoundary>
  );
}

export function SectionErrorBoundary(props: {
  children: ReactNode;
  onRetry?: () => void;
}): ReactNode {
  return (
    <ErrorBoundary
      variant="section"
      fallbackTitle="Could not load settings"
      fallbackDescription="Settings failed to load from this device."
      onRetry={props.onRetry}
    >
      {props.children}
    </ErrorBoundary>
  );
}
