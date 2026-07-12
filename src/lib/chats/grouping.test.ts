import { afterEach, describe, expect, setSystemTime, test } from "bun:test";

import { endOfMonth, subMonths } from "date-fns";

import { groupChatsByRecency } from "@/lib/chats/grouping";
import type { ChatSummary } from "@/lib/chats/types";

function chat(id: string, updatedAt: number): ChatSummary {
  return { id, title: id, updatedAt };
}

describe("groupChatsByRecency", () => {
  afterEach(() => {
    setSystemTime();
  });

  test("buckets by day / week / month boundaries", () => {
    // Wednesday, mid-month — all five buckets can be non-empty.
    setSystemTime(new Date(2024, 8, 18, 12, 0, 0));

    const grouped = groupChatsByRecency([
      chat("today-new", new Date(2024, 8, 18, 15, 0, 0).getTime()),
      chat("today-old", new Date(2024, 8, 18, 9, 0, 0).getTime()),
      chat("yesterday", new Date(2024, 8, 17, 12, 0, 0).getTime()),
      chat("this-week", new Date(2024, 8, 16, 12, 0, 0).getTime()),
      chat("this-month", new Date(2024, 8, 2, 12, 0, 0).getTime()),
      chat("older", new Date(2024, 7, 15, 12, 0, 0).getTime()),
    ]);

    expect(grouped.today.map((c) => c.id)).toEqual(["today-new", "today-old"]);
    expect(grouped.yesterday.map((c) => c.id)).toEqual(["yesterday"]);
    expect(grouped.thisWeek.map((c) => c.id)).toEqual(["this-week"]);
    expect(grouped.thisMonth.map((c) => c.id)).toEqual(["this-month"]);
    expect(grouped.older.map((c) => c.id)).toEqual(["older"]);
  });

  test("sorts each bucket by updatedAt desc", () => {
    setSystemTime(new Date(2024, 8, 18, 12, 0, 0));
    const base = new Date(2024, 8, 18, 10, 0, 0).getTime();
    const grouped = groupChatsByRecency([
      chat("a", base + 1),
      chat("c", base + 3),
      chat("b", base + 2),
    ]);
    expect(grouped.today.map((c) => c.id)).toEqual(["c", "b", "a"]);
  });

  test("end of previous month is older", () => {
    setSystemTime(new Date(2024, 8, 18, 12, 0, 0));
    const prevMonthEnd = endOfMonth(subMonths(new Date(), 1)).getTime();
    const grouped = groupChatsByRecency([chat("old", prevMonthEnd)]);
    expect(grouped.older.map((c) => c.id)).toEqual(["old"]);
    expect(grouped.thisMonth).toEqual([]);
  });
});
