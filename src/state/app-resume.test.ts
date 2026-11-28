import { describe, expect, it, vi } from "vitest";
import {
  contentRetained,
  createAppLifecycleController,
  hostQueriesFocused,
  CONTENT_REFRESH_AWAY_MS,
} from "./app-resume";

function setup(initial: string | null = "active") {
  let clock = 1_000;
  const timers: { run: () => void; at: number; cancelled: boolean }[] = [];
  const effects = {
    holdClocks: vi.fn(),
    resumeClocks: vi.fn(),
    cancelReads: vi.fn(),
    flushDrafts: vi.fn(),
    expirePrivacy: vi.fn(),
  };
  const controller = createAppLifecycleController(effects, {
    initial,
    now: () => clock,
    schedule: (run, ms) => {
      const timer = { run, at: clock + ms, cancelled: false };
      timers.push(timer);
      return timer as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: (timer) => {
      (timer as unknown as { cancelled: boolean }).cancelled = true;
    },
  });
  const advance = (ms: number, jsRuns = true) => {
    clock += ms;
    if (!jsRuns) return;
    for (const timer of timers) if (!timer.cancelled && timer.at <= clock) {
      timer.cancelled = true;
      timer.run();
    }
  };
  return { controller, effects, advance };
}

describe("app lifecycle controller", () => {
  it("keeps everything for an iOS inactive cover such as the shade or a screenshot editor", () => {
    const { controller, effects } = setup();
    expect(controller.appState("inactive")).toBe("inactive");
    expect(controller.appState("active")).toBe("brief-return");
    expect(effects.flushDrafts).toHaveBeenCalledTimes(1);
    expect(effects.cancelReads).not.toHaveBeenCalled();
    expect(effects.expirePrivacy).not.toHaveBeenCalled();
    expect(effects.holdClocks).not.toHaveBeenCalled();
  });

  it("treats a short Android pause (permission prompt, share sheet) as a brief return", () => {
    const { controller, effects, advance } = setup();
    expect(controller.appState("background")).toBe("background");
    expect(effects.holdClocks).toHaveBeenCalledTimes(1);
    expect(effects.cancelReads).toHaveBeenCalledTimes(1);
    expect(effects.flushDrafts).toHaveBeenCalledTimes(1);
    advance(CONTENT_REFRESH_AWAY_MS - 1);
    expect(controller.appState("active")).toBe("brief-return");
    expect(effects.resumeClocks).toHaveBeenCalledTimes(1);
    expect(effects.expirePrivacy).not.toHaveBeenCalled();
    // The disarmed timer never fires later.
    advance(CONTENT_REFRESH_AWAY_MS);
    expect(effects.expirePrivacy).not.toHaveBeenCalled();
  });

  it("expires privacy proof once after a long stay while JavaScript keeps running", () => {
    const { controller, effects, advance } = setup();
    controller.appState("background");
    advance(CONTENT_REFRESH_AWAY_MS);
    expect(effects.expirePrivacy).toHaveBeenCalledTimes(1);
    expect(controller.appState("active")).toBe("long-return");
    expect(effects.expirePrivacy).toHaveBeenCalledTimes(1);
  });

  it("expires privacy proof on return when the OS suspended JavaScript", () => {
    const { controller, effects, advance } = setup();
    controller.appState("inactive");
    controller.appState("background");
    advance(CONTENT_REFRESH_AWAY_MS + 5_000, false);
    expect(effects.expirePrivacy).not.toHaveBeenCalled();
    controller.appState("inactive");
    expect(controller.appState("active")).toBe("long-return");
    expect(effects.expirePrivacy).toHaveBeenCalledTimes(1);
  });

  it("measures the stay from the first background edge and starts over afterwards", () => {
    const { controller, effects, advance } = setup();
    controller.appState("background");
    advance(CONTENT_REFRESH_AWAY_MS - 5_000, false);
    controller.appState("inactive");
    controller.appState("background");
    advance(10_000, false);
    expect(controller.appState("active")).toBe("long-return");
    controller.appState("background");
    advance(1_000);
    expect(controller.appState("active")).toBe("brief-return");
    expect(effects.expirePrivacy).toHaveBeenCalledTimes(1);
  });

  it("ignores repeated and unknown states and a window blur only flushes drafts", () => {
    const { controller, effects } = setup(null);
    expect(controller.appState("active")).toBeNull();
    expect(controller.appState("unknown")).toBeNull();
    controller.windowBlur();
    expect(effects.flushDrafts).toHaveBeenCalledTimes(1);
    expect(effects.cancelReads).not.toHaveBeenCalled();
    expect(effects.expirePrivacy).not.toHaveBeenCalled();
  });

  it("keeps the workspace through a quick switch to another app and reloads only after ten minutes", () => {
    const { controller, effects, advance } = setup();
    controller.appState("background");
    advance(5 * 60_000, false);
    expect(controller.appState("active")).toBe("brief-return");
    expect(effects.expirePrivacy).not.toHaveBeenCalled();
    controller.appState("background");
    advance(10 * 60_000, false);
    expect(controller.appState("active")).toBe("long-return");
    expect(effects.expirePrivacy).toHaveBeenCalledTimes(1);
  });

  it("dispose cancels the pending expiry", () => {
    const { controller, effects, advance } = setup();
    controller.appState("background");
    controller.dispose();
    advance(CONTENT_REFRESH_AWAY_MS * 2);
    expect(effects.expirePrivacy).not.toHaveBeenCalled();
  });
});

describe("hostQueriesFocused", () => {
  const unlocked = { status: "unlocked", enabled: false, appState: "active", windowFocused: true };
  it("stays focused under a system cover while the lock is off", () => {
    expect(hostQueriesFocused(unlocked)).toBe(true);
    expect(hostQueriesFocused({ ...unlocked, windowFocused: false })).toBe(true);
    expect(hostQueriesFocused({ ...unlocked, appState: "inactive" })).toBe(true);
    expect(hostQueriesFocused({ ...unlocked, appState: "background" })).toBe(false);
  });
  it("pauses for any cover while the lock is on, and whenever access is not unlocked", () => {
    const locked = { ...unlocked, enabled: true };
    expect(hostQueriesFocused(locked)).toBe(true);
    expect(hostQueriesFocused({ ...locked, windowFocused: false })).toBe(false);
    expect(hostQueriesFocused({ ...locked, appState: "inactive" })).toBe(false);
    expect(hostQueriesFocused({ ...unlocked, status: "suspended" })).toBe(false);
  });
});

describe("contentRetained", () => {
  it("keeps unlocked content through inactive and background while the lock is off", () => {
    for (const appState of ["active", "inactive", "background"])
      expect(contentRetained({ status: "unlocked", enabled: false, appState })).toBe(true);
  });
  it("leaves concealment to the lock while it is on", () => {
    expect(contentRetained({ status: "unlocked", enabled: true, appState: "active" })).toBe(true);
    // Only an app-initiated system prompt keeps a locked-capable app unlocked while inactive.
    expect(contentRetained({ status: "unlocked", enabled: true, appState: "inactive" })).toBe(true);
    expect(contentRetained({ status: "unlocked", enabled: true, appState: "background" })).toBe(false);
    expect(contentRetained({ status: "suspended", enabled: true, appState: "active" })).toBe(false);
    expect(contentRetained({ status: "locked", enabled: false, appState: "active" })).toBe(false);
  });
  it("always retains unlocked content on web", () => {
    expect(contentRetained({ status: "unlocked", enabled: true, appState: "background" }, false)).toBe(true);
  });
});
