import { useState } from "react";

import { getDefaultAgentModelId } from "@/lib/agent-models";

import { TaskPromptComposer } from "./Composer";
import { HomePageHeader } from "./header";

export function HomePageContent() {
  const [modelId, setModelId] = useState(getDefaultAgentModelId);

  return (
    <div className="flex flex-col h-full w-full gap-0 overflow-hidden box-border overscroll-contain">
      <div>
        <HomePageHeader />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 pt-0">{/* AI chat */}</div>
      <div className="flex min-h-12 flex-col gap-2 p-2">
        <TaskPromptComposer
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
          onCancel={() => {}}
          inputDisabled={false}
          submitDisabled={false}
          cancelVisible={false}
          modelId={modelId}
          onModelChange={setModelId}
          models={[]}
        />
      </div>
    </div>
  );
}
