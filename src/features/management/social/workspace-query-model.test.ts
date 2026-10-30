import { describe, expect, it, vi } from "vitest";
import type { SocialSnapshot } from "@/domain/types";
import { pageNavigation, SOCIAL_PAGE_LIMIT, SocialWorkspaceCache, workspaceInput, workspaceSearch } from "./workspace-query-model";

function snapshot(environmentId = "computer-a"): SocialSnapshot {
  const collections = ["campaigns", "publishingPlans", "threads", "contacts", "rules", "jobs", "drafts"];
  return {
    executorId: environmentId, hostOnline: true, sendingEnabled: false, stopped: false, pollingEnabled: false,
    accounts: [], profiles: [], segments: [], capabilities: {},
    campaigns: [], publishingPlans: [], threads: [], contacts: [], rules: [], jobs: [], drafts: [],
    pages: Object.fromEntries(collections.map((key) => [key, { offset: 0, limit: SOCIAL_PAGE_LIMIT, total: 0 }])),
  };
}
const response = (value = snapshot(), cursor = "revision-a") => ({ cursor, unchanged: false, snapshot: value });

describe("bounded social workspace reads", () => {
  it("binds the active section, collection offset, project and global text filter", () => {
    expect(workspaceInput("inbox", "project-a", 20, "  customer  ")).toEqual({
      section: "inbox", limit: 20, projectId: "project-a", offsets: { threads: 20 }, filters: { threads: { query: "customer" } },
    });
    expect(workspaceInput("drafts", null, 0, "")).toEqual({ section: "inbox", limit: 20, offsets: { drafts: 0 } });
    expect(workspaceInput("jobs", null, 40, "failed")).toMatchObject({ section: "history", offsets: { jobs: 40 }, filters: { jobs: { query: "failed" } } });
    expect(workspaceInput("accounts", null, 0, "")).toEqual({ section: "accounts", limit: 20 });
    expect(() => workspaceInput("inbox", null, -1, "")).toThrow();
  });

  it("rejects invalid searches before a reader can send a different or truncated query", () => {
    expect(workspaceSearch("  " + "a".repeat(1000) + " ").invalid).toBe(false);
    expect(workspaceSearch("a".repeat(1001)).invalid).toBe(true);
    const request = vi.fn();
    expect(() => {
      const input = workspaceInput("inbox", null, 0, "a".repeat(1001));
      request(input);
    }).toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("reuses an unchanged cursor only for its original connection and exact query", async () => {
    const cache = new SocialWorkspaceCache();
    const request = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce({ cursor: "revision-a", unchanged: true })
      .mockResolvedValue(response(snapshot(), "revision-b"));
    const first = workspaceInput("inbox", null, 0, "");
    const value = await cache.read(first, "computer-a", request, () => true);
    expect(await cache.read(first, "computer-a", request, () => true)).toBe(value);
    expect(request.mock.calls[0][0]).not.toHaveProperty("cursor");
    expect(request.mock.calls[1][0]).toMatchObject({ cursor: "revision-a" });
    await cache.read(workspaceInput("inbox", null, 20, ""), "computer-a", request, () => true);
    expect(request.mock.calls[2][0]).not.toHaveProperty("cursor");
    await new SocialWorkspaceCache().read(first, "computer-a", request, () => true);
    expect(request.mock.calls[3][0]).not.toHaveProperty("cursor");
  });

  it("returns retained data only for the exact query input", async () => {
    const cache = new SocialWorkspaceCache();
    const first = workspaceInput("inbox", "project-a", 0, "");
    const value = await cache.read(first, "computer-a", async () => response(), () => true);
    expect(cache.peek(first)).toBe(value);
    expect(cache.peek({ ...first })).toBe(value);
    for (const other of [
      workspaceInput("inbox", "project-b", 0, ""), workspaceInput("inbox", "project-a", 20, ""),
      workspaceInput("inbox", "project-a", 0, "needle"), workspaceInput("drafts", "project-a", 0, ""),
    ]) expect(cache.peek(other)).toBeUndefined();
  });

  it("rejects late results after a connection change and never retains them", async () => {
    const cache = new SocialWorkspaceCache();
    let current = true;
    let resolve!: (value: unknown) => void;
    const read = cache.read(workspaceInput("inbox", null, 0, ""), "computer-a", () => new Promise((done) => { resolve = done; }), () => current);
    current = false;
    resolve(response());
    await expect(read).rejects.toMatchObject({ code: "scope" });
    expect(cache.peek(workspaceInput("inbox", null, 0, ""))).toBeUndefined();
    const request = vi.fn();
    await expect(cache.read(workspaceInput("inbox", null, 0, ""), "computer-a", request, () => false)).rejects.toMatchObject({ code: "scope" });
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects missing snapshots, unexplained unchanged responses, wrong executors and full-history list responses", async () => {
    const input = workspaceInput("inbox", null, 0, "");
    for (const invalid of [
      { cursor: "x", unchanged: true }, { cursor: "x", unchanged: false }, response(snapshot("computer-b")),
      response({ ...snapshot(), pages: undefined }),
      response({ ...snapshot(), threads: [{ eventsPreview: false, events: [{ text: "Full history" }] }] } as SocialSnapshot),
    ]) await expect(new SocialWorkspaceCache().read(input, "computer-a", async () => invalid, () => true)).rejects.toThrow();
    const bounded = snapshot();
    bounded.threads = [{ eventsPreview: true, events: [{ text: "😀".repeat(300) }] }] as SocialSnapshot["threads"];
    bounded.pages!.threads = { offset: 0, limit: 20, total: 1 };
    await expect(new SocialWorkspaceCache().read(input, "computer-a", async () => response(bounded), () => true)).resolves.toBe(bounded);
  });

  it("fails closed on an older host without issuing an unbounded fallback", async () => {
    const request = vi.fn().mockRejectedValue(new Error("Unsupported social operation."));
    await expect(new SocialWorkspaceCache().read(workspaceInput("inbox", null, 0, ""), "computer-a", request, () => true))
      .rejects.toMatchObject({ code: "unsupported" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("navigates host pages including a partial last page and an empty collection", () => {
    expect(pageNavigation({ offset: 20, limit: 20, total: 45 })).toEqual({ previous: 0, next: 40, hasPrevious: true, hasNext: true, first: 21, last: 40 });
    expect(pageNavigation({ offset: 40, limit: 20, total: 45 })).toMatchObject({ previous: 20, hasNext: false, first: 41, last: 45 });
    expect(pageNavigation({ offset: 0, limit: 20, total: 0 })).toMatchObject({ hasPrevious: false, hasNext: false, first: 0, last: 0 });
  });
});
