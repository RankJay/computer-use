import { beforeEach, describe, expect, test } from "bun:test";

import {
  getUpdateDialogView,
  getUpdaterSnapshot,
  resetUpdaterSession,
  setPendingUpdate,
  setSessionArm,
  setUpdaterPhase,
} from "@/lib/updater/store";

describe("updater store", () => {
  beforeEach(() => {
    resetUpdaterSession();
  });

  test("tracks phase and session arm", () => {
    setUpdaterPhase("ready");
    setSessionArm(true);
    setPendingUpdate(null, "1.2.3");

    expect(getUpdaterSnapshot()).toEqual({
      phase: "ready",
      version: "1.2.3",
      sessionArm: true,
    });
  });

  test("reset clears session state", () => {
    setUpdaterPhase("armed");
    setSessionArm(true);
    setPendingUpdate(null, "2.0.0");
    resetUpdaterSession();

    expect(getUpdaterSnapshot()).toEqual({
      phase: "idle",
      version: null,
      sessionArm: false,
    });
    expect(getUpdateDialogView()).toBeNull();
  });

  test("getUpdaterSnapshot returns the same reference until state changes", () => {
    const first = getUpdaterSnapshot();
    expect(getUpdaterSnapshot()).toBe(first);

    setUpdaterPhase("checking");
    const second = getUpdaterSnapshot();
    expect(second).not.toBe(first);
    expect(getUpdaterSnapshot()).toBe(second);
  });

  test("dialog view stays null through check/download and stabilizes when ready", () => {
    expect(getUpdateDialogView()).toBeNull();

    setUpdaterPhase("checking");
    setPendingUpdate(null, "1.2.3");
    setUpdaterPhase("downloading");
    expect(getUpdateDialogView()).toBeNull();

    setUpdaterPhase("ready");
    const ready = getUpdateDialogView();
    expect(ready).toEqual({ version: "1.2.3" });
    expect(getUpdateDialogView()).toBe(ready);

    setSessionArm(true);
    expect(getUpdateDialogView()).toBe(ready);

    setUpdaterPhase("armed");
    expect(getUpdateDialogView()).toBeNull();
  });
});
