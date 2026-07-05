import { useCallback, useState } from "react";

import { Container, Item } from "@/components/motion/stagger";

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
      <div className="flex flex-1">
        <Container className="flex min-h-0 flex-1 flex-col gap-2 scrollbar-none">
          <div className="flex flex-col flex-1 pt-56 px-4">
            <Item className="max-w-sm text-2xl mb-2 text-[#414141] tracking-tight">
              Welcome to actuate.
            </Item>
            <Item className="max-w-xs text-2xl tracking-tight text-[#CDCDCD]">
              Ready to break some big tasks today?
            </Item>
          </div>
        </Container>
      </div>
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
