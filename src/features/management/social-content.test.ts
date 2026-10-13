import { describe, expect, it } from "vitest";
import {
  canEditSocialDraft,
  exceedsSocialLimit,
  missingFactIds,
  socialCharacterCount,
} from "./social-content";

describe("mobile social content parity", () => {
  it("counts Unicode characters with the same contract as the host", () => {
    expect(socialCharacterCount("🎉Türkçe")).toBe(7);
    expect(exceedsSocialLimit({ maxMessageCharacters: 2 }, "message", " 🙂🎉 ")).toBeUndefined();
    expect(exceedsSocialLimit({ maxMessageCharacters: 1 }, "message", "🙂🎉")).toBe(1);
  });
  it("uses the content kind limit rather than another field or a fabricated default", () => {
    const policy = { maxContentCharacters: 4, maxCommentCharacters: 2 };
    expect(exceedsSocialLimit(policy, "comment", "abc")).toBe(2);
    expect(exceedsSocialLimit(policy, "content", "abc")).toBeUndefined();
    expect(exceedsSocialLimit(policy, "message", "long direct message")).toBeUndefined();
  });
  it("keeps removed fact references visible for explicit correction", () => {
    expect(missingFactIds(["valid", "removed"], [{ id: "valid" }])).toEqual(["removed"]);
  });
  it("allows corrections only before dispatch and after an undispatched queued send is cancelled", () => {
    expect(canEditSocialDraft({ id: "draft" }, [{ draftId: "draft", status: "queued" }])).toBe(
      false,
    );
    expect(canEditSocialDraft({ id: "draft" }, [{ draftId: "draft", status: "cancelled" }])).toBe(
      true,
    );
    expect(
      canEditSocialDraft({ id: "draft" }, [
        { draftId: "draft", status: "cancelled", dispatchedAt: 1 },
      ]),
    ).toBe(false);
  });
});
