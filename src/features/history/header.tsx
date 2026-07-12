import { ArrowLeft } from "lucide-react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";

export function HistoryPageHeader(): ReactElement {
  return (
    <header className="flex w-full relative shrink-0 select-none items-center justify-between p-4">
      <div className="flex items-center gap-4">
        <Link
          to="/"
          aria-label="Back to home"
          className="inline-flex items-center justify-center rounded-md text-[#cdcdcd] transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4 text-[#3F3F3F] transition-[color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-[#9c9c9c] active:scale-[0.95] active:text-[#aeaeae] motion-reduce:transition-none" />
        </Link>
        <h1 className="text-base font-[450] shrink-0 tracking-tight text-foreground">History</h1>
      </div>
    </header>
  );
}
