import { type ReactElement } from "react";

import { SuspenseQueryBoundary } from "@/components/boundaries/ErrorBoundary";
import { ChatRow } from "@/features/history/ChatRow";
import { HistoryPageHeader } from "@/features/history/header";
import { HistoryPageSkeleton } from "@/features/history/HistoryPageSkeleton";
import { groupChatsByRecency, type ChatsByRecency } from "@/lib/chats/grouping";
import { chatsKeys, useChatsList } from "@/lib/chats/queries";
import type { ChatSummary } from "@/lib/chats/types";

const RECENCY_SECTIONS: readonly { key: keyof ChatsByRecency; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This week" },
  { key: "thisMonth", label: "This month" },
  { key: "older", label: "Older" },
];

function HistoryChatList(): ReactElement {
  const { data: chats } = useChatsList();

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 px-4 py-16 text-center">
        <p className="text-sm text-foreground">No chats yet</p>
        <p className="text-[13px] leading-4 text-[#767676]">
          Conversations you start will show up here.
        </p>
      </div>
    );
  }

  const grouped = groupChatsByRecency(chats);

  return (
    <div className="flex flex-col gap-8 pt-1">
      {RECENCY_SECTIONS.map(({ key, label }) => {
        const sectionChats: ChatSummary[] = grouped[key];
        if (sectionChats.length === 0) {
          return null;
        }

        return (
          <section key={key} className="flex flex-col gap-3">
            <h2 className="px-4 text-sm text-foreground">{label}</h2>
            <div className="divide-y divide-[#252525] overflow-hidden rounded-xl bg-[#141414] text-foreground shadow-layered">
              {sectionChats.map((chat) => (
                <ChatRow key={chat.id} chat={chat} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function HistoryPageContent(): ReactElement {
  return (
    <div className="flex h-full w-full flex-col gap-0 overflow-hidden box-border overscroll-contain">
      <div>
        <HistoryPageHeader />
      </div>
      <div className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-8 overflow-y-auto px-4 pb-4 scrollbar-none md:max-w-3xl">
        <SuspenseQueryBoundary
          queryKey={chatsKeys.list()}
          fallback={<HistoryPageSkeleton />}
          fallbackTitle="Could not load history"
          fallbackDescription="Chat history failed to load from this device."
        >
          <HistoryChatList />
        </SuspenseQueryBoundary>
      </div>
    </div>
  );
}
