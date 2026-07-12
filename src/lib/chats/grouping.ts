import { isThisMonth, isThisWeek, isToday, isYesterday } from "date-fns";

import type { ChatSummary } from "@/lib/chats/types";

export type ChatsByRecency = {
  today: ChatSummary[];
  yesterday: ChatSummary[];
  thisWeek: ChatSummary[];
  thisMonth: ChatSummary[];
  older: ChatSummary[];
};

function byUpdatedAtDesc(a: ChatSummary, b: ChatSummary): number {
  return b.updatedAt - a.updatedAt;
}

export function groupChatsByRecency(chats: ChatSummary[]): ChatsByRecency {
  const groups: ChatsByRecency = {
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    older: [],
  };

  for (const chat of chats) {
    const date = new Date(chat.updatedAt);
    if (isToday(date)) {
      groups.today.push(chat);
    } else if (isYesterday(date)) {
      groups.yesterday.push(chat);
    } else if (isThisWeek(date)) {
      groups.thisWeek.push(chat);
    } else if (isThisMonth(date)) {
      groups.thisMonth.push(chat);
    } else {
      groups.older.push(chat);
    }
  }

  groups.today.sort(byUpdatedAtDesc);
  groups.yesterday.sort(byUpdatedAtDesc);
  groups.thisWeek.sort(byUpdatedAtDesc);
  groups.thisMonth.sort(byUpdatedAtDesc);
  groups.older.sort(byUpdatedAtDesc);

  return groups;
}
