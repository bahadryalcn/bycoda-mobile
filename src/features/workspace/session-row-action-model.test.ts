import { describe, expect, it, vi } from "vitest";
import type { HostSession, HostSessionSummary } from "./wire";
import {
  performSessionRowAction,
  reviewSessionRow,
  sessionRowReviewMatches,
} from "./session-row-action-model";

const summary: HostSessionSummary = {
  id: "session",
  projectId: "project",
  title: "Reviewed title",
  harness: "codex",
  status: "idle",
  updatedAt: 10,
  revision: 3,
  authorityGeneration: 2,
};
const snapshot = (changes: Partial<HostSession> = {}) =>
  ({
    projectId: "project",
    status: "idle",
    revision: 3,
    authorityGeneration: 2,
    session: { id: "session", title: "Reviewed title" },
    ...changes,
  }) as HostSession;
const review = () => reviewSessionRow("machine", "project", summary);
describe("session row reviewed mutations", () => {
  it.each(["archive", "delete"] as const)(
    "sends %s once with captured project and authority",
    async (action) => {
      const write = vi.fn(async () => ({})),
        read = vi.fn(async () => snapshot()),
        assertCurrent = vi.fn();
      await performSessionRowAction(action, review(), { write, read, assertCurrent });
      expect(write).toHaveBeenCalledExactlyOnceWith({
        projectId: "project",
        sessionId: "session",
        authorityGeneration: 2,
        ...(action === "archive" ? { archived: true } : {}),
      });
      expect(read).toHaveBeenCalledOnce();
      expect(assertCurrent).toHaveBeenCalledTimes(2);
    },
  );
  it.each([
    { projectId: "other" },
    { revision: 4 },
    { authorityGeneration: 3 },
    { archived: true },
    { status: "running" as const },
  ])("does not bless changed live session %j", async (changes) => {
    const write = vi.fn(async () => ({}));
    await expect(
      performSessionRowAction("delete", review(), {
        write,
        read: async () => snapshot(changes),
        assertCurrent: () => undefined,
      }),
    ).rejects.toThrow("changed");
    expect(write).not.toHaveBeenCalled();
  });
  it("retains missing legacy authority rather than adopting a newer generation", async () => {
    const reviewed = reviewSessionRow("machine", "project", {
      ...summary,
      authorityGeneration: undefined,
    });
    const write = vi.fn(async () => ({}));
    await expect(
      performSessionRowAction("archive", reviewed, {
        write,
        read: async () => snapshot(),
        assertCurrent: () => undefined,
      }),
    ).rejects.toThrow("changed");
    expect(write).not.toHaveBeenCalled();
  });
  it("rejects an expired connection or visibility proof after preflight", async () => {
    let valid = true;
    const write = vi.fn(async () => ({}));
    await expect(
      performSessionRowAction("delete", review(), {
        write,
        read: async () => {
          valid = false;
          return snapshot();
        },
        assertCurrent: () => {
          if (!valid) throw new Error("Retired");
        },
      }),
    ).rejects.toThrow("Retired");
    expect(write).not.toHaveBeenCalled();
  });
  it("allows archiving a running session but never deleting it", async () => {
    const reviewed = reviewSessionRow("machine", "project", { ...summary, status: "running" });
    const ports = {
      write: vi.fn(async () => ({})),
      read: async () => snapshot({ status: "running" }),
      assertCurrent: () => undefined,
    };
    await expect(performSessionRowAction("delete", reviewed, ports)).rejects.toThrow("Stop");
    expect(ports.write).not.toHaveBeenCalled();
    await performSessionRowAction("archive", reviewed, ports);
    expect(ports.write).toHaveBeenCalledOnce();
  });
  it("retains unknown write outcome without any replay", async () => {
    const error = new Error("Outcome unknown");
    const write = vi.fn(async () => {
      throw error;
    });
    await expect(
      performSessionRowAction("archive", review(), {
        write,
        read: async () => snapshot(),
        assertCurrent: () => undefined,
      }),
    ).rejects.toBe(error);
    expect(write).toHaveBeenCalledOnce();
  });
  it("rejects wrong list project and stale row reviews", () => {
    expect(() => reviewSessionRow("machine", "wrong", summary)).toThrow("project");
    expect(sessionRowReviewMatches(review(), "machine", "project", summary)).toBe(true);
    for (const changed of [
      { ...summary, revision: 4 },
      { ...summary, archived: true },
      { ...summary, authorityGeneration: 4 },
    ])
      expect(sessionRowReviewMatches(review(), "machine", "project", changed)).toBe(false);
  });
});
