import { describe, expect, it } from "vitest";
import { linkPullRequestReason, parsePullRequestInput, pickLinkSession } from "./git-link-pr-model";

const copy = (_tr: string, en: string) => en;
describe("link pull request input", () => {
  it("reads numbers and github links", () => {
    expect(parsePullRequestInput(" #42 ")).toEqual({ ok: true, target: { number: 42 } });
    expect(parsePullRequestInput("7")).toEqual({ ok: true, target: { number: 7 } });
    expect(parsePullRequestInput("https://github.com/a/b/pull/9/files")).toEqual({ ok: true, target: { url: "https://github.com/a/b/pull/9/files" } });
  });
  it("rejects empty, zero and foreign input", () => {
    expect(parsePullRequestInput("  ")).toEqual({ ok: false, reason: "empty" });
    for (const bad of ["0", "#0", "-3", "4.5", "https://gitlab.com/a/b/pull/1", "http://github.com/a/b/pull/1", "github.com/a/b/pull/1"])
      expect(parsePullRequestInput(bad)).toEqual({ ok: false, reason: "invalid" });
  });
});
describe("link target", () => {
  it("prefers the newest session of this checkout", () => {
    const sessions = [{ id: "a", updatedAt: 5, cwd: "/x" }, { id: "b", updatedAt: 9, cwd: "/y" }, { id: "c", updatedAt: 7, cwd: "/x" }];
    expect(pickLinkSession(sessions, "/x")?.id).toBe("c");
    expect(pickLinkSession(sessions, "/none")?.id).toBe("b");
    expect(pickLinkSession([], "/x")).toBeUndefined();
  });
  it("explains why linking is unavailable", () => {
    expect(linkPullRequestReason({ remote: null, hasSession: true }, copy)).toBe("This branch has no remote.");
    expect(linkPullRequestReason({ remote: "origin", hasSession: false }, copy)).toMatch(/No session/);
    expect(linkPullRequestReason({ remote: "origin", hasSession: true }, copy)).toBe("");
  });
});
