import { describe, expect, it } from "vitest";
import { initialSocialFlow, socialFlowReducer } from "./social-flow";

describe("social editor flow", () => {
  it("replaces the previous editor and switches to its owning tab", () => {
    const thread = socialFlowReducer(initialSocialFlow, {
      type: "open",
      editor: { kind: "thread", id: "thread-a" },
    });
    const campaign = socialFlowReducer(thread, {
      type: "open",
      editor: { kind: "campaign", accountId: "account-b", projectId: "project-b" },
    });
    expect(campaign).toEqual({
      tab: "campaigns",
      editor: { kind: "campaign", accountId: "account-b", projectId: "project-b" },
    });
  });
  it("closes the editor when navigating to another tab", () => {
    const draft = socialFlowReducer(initialSocialFlow, {
      type: "open",
      editor: { kind: "draft", id: "draft-a" },
    });
    expect(socialFlowReducer(draft, { type: "tab", tab: "jobs" })).toEqual({
      tab: "jobs",
      editor: { kind: "closed" },
    });
  });
  it("ignores completion of a previous editor after another one opens", () => {
    const first = socialFlowReducer(initialSocialFlow, {
      type: "open",
      editor: { kind: "draft", id: "draft-a" },
    });
    const next = socialFlowReducer(first, {
      type: "open",
      editor: { kind: "draft", id: "draft-b" },
    });
    expect(socialFlowReducer(next, { type: "close", editor: first.editor })).toBe(next);
  });
});
