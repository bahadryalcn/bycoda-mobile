import { describe, expect, it } from "vitest";
import {
  limitedTarget,
  limitedTargetLabel,
  usageLimitActions,
  usageLimitPhase,
  usageLimitResetDelay,
} from "./usage-limit-model";

const now = 1_000_000;

describe("usage limit phase", () => {
  it("reads the Host limit like desktop's notice", () => {
    expect(usageLimitPhase({ resetsAt: now + 60_000 }, now)).toBe("waiting");
    expect(usageLimitPhase({ resetsAt: now + 60_000, resumeAtReset: true }, now)).toBe("armed");
    expect(usageLimitPhase({ resetsAt: now - 1 }, now)).toBe("reset");
    expect(usageLimitPhase({}, now)).toBe("unknown");
    expect(
      usageLimitPhase({ resetsAt: now + 60_000, recoveryFrom: { harness: "claude", model: "opus" } }, now),
    ).toBe("ready");
  });

  it("flips at the reset deadline only while one is ahead", () => {
    expect(usageLimitResetDelay({ resetsAt: now + 5000 }, now)).toBe(5000);
    expect(usageLimitResetDelay({ resetsAt: now - 5 }, now)).toBeUndefined();
    expect(usageLimitResetDelay({}, now)).toBeUndefined();
  });
});

describe("usage limit actions", () => {
  it("arms a reset ahead, cancels an armed one and resumes a passed or unknown reset", () => {
    expect(usageLimitActions("waiting")).toEqual({ primary: "arm", secondary: ["switch", "dismiss"] });
    expect(usageLimitActions("armed")).toEqual({ secondary: ["disarm", "switch", "dismiss"] });
    expect(usageLimitActions("reset").primary).toBe("resume");
    expect(usageLimitActions("unknown").primary).toBe("resume");
    expect(usageLimitActions("ready")).toEqual({ primary: "resume", secondary: ["dismiss"] });
  });
});

describe("limited target", () => {
  const accounts = {
    claude: [
      { id: "default", label: "Host default", isDefault: true },
      { id: "work", label: "Work" },
    ],
  } as never;

  it("names the account only when the provider has several", () => {
    expect(limitedTargetLabel({ provider: "claude", accountId: "work" }, accounts, "Default account")).toBe("Claude · Work");
    expect(limitedTargetLabel({ provider: "claude" }, accounts, "Default account")).toBe("Claude · Default account");
    expect(limitedTargetLabel({ provider: "codex" }, accounts, "Default account")).toBe("Codex");
  });

  it("keeps the limited origin after a switch", () => {
    expect(
      limitedTarget({
        harness: "codex",
        providerAccountId: undefined,
        usageLimit: { recoveryFrom: { harness: "claude", model: "opus", providerAccountId: "work" } },
      }),
    ).toEqual({ provider: "claude", accountId: "work" });
  });
});
