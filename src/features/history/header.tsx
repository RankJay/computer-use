import { ArrowLeft } from "lucide-react";
import { useCallback, type ReactElement } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { canNavigateBack } from "@/lib/runtime/can-navigate-back";

export function HistoryPageHeader(): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();

  const goBack = useCallback((): void => {
    if (!canNavigateBack(location.key)) {
      navigate("/");
      return;
    }
    navigate(-1);
  }, [location.key, navigate]);

  return (
    <header className="flex w-full relative shrink-0 select-none items-center justify-between p-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Back"
          onClick={goBack}
          className="inline-flex items-center justify-center rounded-md text-[#cdcdcd] transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4 text-[#3F3F3F] transition-[color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-[#9c9c9c] active:scale-[0.95] active:text-[#aeaeae] motion-reduce:transition-none" />
        </button>
        <h1 className="text-base font-[450] shrink-0 tracking-tight text-foreground">History</h1>
      </div>
    </header>
  );
}
