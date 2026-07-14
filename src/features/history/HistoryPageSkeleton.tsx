import type { ReactElement } from "react";

import { ContentSkeleton } from "@/components/ui/content-skeleton";
import { ChatRow } from "@/features/history/ChatRow";
import type { ChatSummary } from "@/lib/chats/types";

const HISTORY_SKELETON_SECTIONS: readonly {
  label: string;
  chats: readonly ChatSummary[];
}[] = [
  {
    label: "Today",
    chats: [
      {
        id: "skeleton-today-1",
        title: "Scaffold project structure and agents",
        updatedAt: Date.now() - 1000 * 60 * 12,
      },
      {
        id: "skeleton-today-2",
        title: "Wire session timeline and permissions",
        updatedAt: Date.now() - 1000 * 60 * 45,
      },
      {
        id: "skeleton-today-3",
        title: "Polish history and settings loading",
        updatedAt: Date.now() - 1000 * 60 * 90,
      },
    ],
  },
  {
    label: "Yesterday",
    chats: [
      {
        id: "skeleton-yesterday-1",
        title: "Explore capability catalog layout",
        updatedAt: Date.now() - 1000 * 60 * 60 * 26,
      },
      {
        id: "skeleton-yesterday-2",
        title: "Debug native invoke error mapping",
        updatedAt: Date.now() - 1000 * 60 * 60 * 30,
      },
    ],
  },
];

export function HistoryPageSkeleton(): ReactElement {
  return (
    <ContentSkeleton loading className="flex flex-col gap-8 pt-1">
      {HISTORY_SKELETON_SECTIONS.map((section) => (
        <section key={section.label} className="flex flex-col gap-3">
          <h2 className="px-4 text-sm text-foreground">{section.label}</h2>
          <div className="divide-y divide-[#252525] overflow-hidden rounded-xl bg-[#141414] text-foreground shadow-layered">
            {section.chats.map((chat) => (
              <ChatRow key={chat.id} chat={chat} />
            ))}
          </div>
        </section>
      ))}
    </ContentSkeleton>
  );
}
