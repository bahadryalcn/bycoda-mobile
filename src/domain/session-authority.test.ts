import { describe, expect, it } from "vitest";
import {
  captureSessionAuthority,
  retainSessionAuthority,
  sessionIntent,
} from "./session-authority";

describe("mobile authority-bound intents", () => {
  it("captures new intents from the displayed view and preserves older attempts including legacy absence", () => {
    for (const type of [
      "send",
      "draft",
      "configure",
      "cancel",
      "steer",
      "approve",
      "answer",
      "compact",
      "shell",
      "rewind",
    ]) {
      const old = sessionIntent({ authorityGeneration: 2 }, { type, sessionId: "session" });
      expect(sessionIntent({ authorityGeneration: 3 }, old).authorityGeneration).toBe(2);
      const legacy = sessionIntent({}, { type, sessionId: "session" });
      expect(Object.hasOwn(legacy, "authorityGeneration")).toBe(true);
      expect(sessionIntent({ authorityGeneration: 3 }, legacy).authorityGeneration).toBeUndefined();
      expect(
        sessionIntent({ authorityGeneration: 3 }, { type, sessionId: "session" })
          .authorityGeneration,
      ).toBe(3);
    }
  });
  it("does not let same-revision or pinned reads roll back a committed floor", () => {
    expect(
      retainSessionAuthority({ authorityGeneration: 3 }, { revision: 7, authorityGeneration: 4 }),
    ).toEqual({ revision: 7, authorityGeneration: 4 });
    expect(
      retainSessionAuthority({ authorityGeneration: 4 }, { revision: 7, authorityGeneration: 3 }),
    ).toEqual({ revision: 7, authorityGeneration: 4 });
    expect(
      retainSessionAuthority(
        { authorityGeneration: 4 },
        { revision: 7, authorityGeneration: undefined },
      ),
    ).toEqual({ revision: 7, authorityGeneration: 4 });
  });
  it("rejects invalid authority metadata instead of downgrading it to a legacy intent", () => {
    for (const authorityGeneration of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "3", null])
      expect(() => captureSessionAuthority({ authorityGeneration } as never)).toThrow();
  });
});
