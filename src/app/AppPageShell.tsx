import type { ReactElement, ReactNode } from "react";

/** Shared chrome for routed pages and lazy-route fallbacks. */
export function AppPageShell(props: { readonly children?: ReactNode }): ReactElement {
  return (
    <main className="flex h-screen w-screen flex-col items-center justify-start bg-background text-white shadow-none ring-0">
      {props.children}
    </main>
  );
}
