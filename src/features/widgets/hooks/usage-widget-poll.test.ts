import { describe, expect, it } from "vitest";

import { USAGE_WIDGET_POLL_MS, isUsagePollDue } from "./usage-widget-poll";

const base = { supported: true, gated: true, focused: true, lastFetchAt: 0, now: 1_000_000 };

describe("isUsagePollDue", () => {
  it("polls once on the first foreground opportunity", () => {
    expect(isUsagePollDue(base)).toBe(true);
  });

  it("never polls when the computer lacks the read, or the app is locked or signed out", () => {
    expect(isUsagePollDue({ ...base, supported: false })).toBe(false);
    expect(isUsagePollDue({ ...base, gated: false })).toBe(false);
  });

  it("never polls in the background", () => {
    expect(isUsagePollDue({ ...base, focused: false })).toBe(false);
  });

  it("waits for the full interval after the last poll", () => {
    const lastFetchAt = base.now;
    expect(isUsagePollDue({ ...base, lastFetchAt, now: base.now + USAGE_WIDGET_POLL_MS - 1 })).toBe(false);
    expect(isUsagePollDue({ ...base, lastFetchAt, now: base.now + USAGE_WIDGET_POLL_MS })).toBe(true);
  });

  it("uses a ten minute interval", () => {
    expect(USAGE_WIDGET_POLL_MS).toBe(600_000);
  });
});
