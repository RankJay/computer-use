import { useCallback, useState } from "react";

import { TaskPromptComposer } from "./TaskPromptComposer";

export function ControlCenter() {
  const [draft, setDraft] = useState("");
  const canStart = draft.trim().length > 0;

  const submitTask = useCallback((): void => {
    if (!canStart) return;
    setDraft("");
  }, [canStart]);

  return (
    <div className="box-border overscroll-contain flex h-full min-h-dvh w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#0E0E0E] text-white p-2 shadow-none ring-0">
      <div className="flex flex-1" />
      <TaskPromptComposer
        value={draft}
        onChange={setDraft}
        onSubmit={submitTask}
        onCancel={() => {}}
        inputDisabled={false}
        submitDisabled={!canStart}
        cancelVisible={false}
      />
    </div>
  );
}
