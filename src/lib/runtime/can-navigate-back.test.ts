import { afterEach, describe, expect, test } from "bun:test";

import { canNavigateBack } from "@/lib/runtime/can-navigate-back";

type HistoryState = { idx?: number; key?: string } | null;

let historyState: HistoryState = null;

const historyStub = {
  get state(): HistoryState {
    return historyState;
  },
  replaceState(state: HistoryState): void {
    historyState = state;
  },
};

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { history: historyStub },
});

afterEach(() => {
  historyState = null;
});

describe("canNavigateBack", () => {
  test("false for the initial default location key", () => {
    historyStub.replaceState({ idx: 1, key: "abc" });
    expect(canNavigateBack("default")).toBe(false);
  });

  test("false when React Router history idx is 0", () => {
    historyStub.replaceState({ idx: 0, key: "abc" });
    expect(canNavigateBack("ghi")).toBe(false);
  });

  test("true when React Router history idx is greater than 0", () => {
    historyStub.replaceState({ idx: 2, key: "abc" });
    expect(canNavigateBack("ghi")).toBe(true);
  });

  test("true when history state has no idx", () => {
    historyStub.replaceState({ key: "abc" });
    expect(canNavigateBack("ghi")).toBe(true);
  });
});
