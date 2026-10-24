import { expect, it, vi } from "vitest";
import type { HostTransport } from "@/remote/transport";
import { selectiveReview, stableGitReview } from "./git-selective-query";
import { diffLines as compareLines } from "diff";
vi.mock("diff", async (original) => {
  const actual = await original<typeof import("diff")>();
  return { ...actual, diffLines: vi.fn(actual.diffLines) };
});
it("shares one complete comparison between selective validation and hunks", async () => {
  vi.mocked(compareLines).mockClear();
  const request = vi.fn().mockResolvedValueOnce({ token: "a".repeat(64) }).mockResolvedValueOnce({ relative: "a.txt", original: "old\r\n", current: "new\r\n", binary: false, tooLarge: false }).mockResolvedValueOnce({ token: "a".repeat(64) });
  const review = await selectiveReview({ request } as unknown as Pick<HostTransport, "request">, { projectId: "p", root: "/repo" }, "a.txt");
  expect(compareLines).toHaveBeenCalledTimes(1);
  expect(review.hunks[0]!.lines.map((line) => line.raw)).toEqual(["old\r\n", "new\r\n"]);
});
it("rejects a review assembled across repository snapshots", async () => {
  const request = vi.fn().mockResolvedValueOnce({ token: "a".repeat(64) }).mockResolvedValueOnce({ token: "b".repeat(64) });
  const read = vi.fn(async () => "reviewed");
  await expect(stableGitReview({ request } as unknown as Pick<HostTransport, "request">, { projectId: "p", root: "/repo" }, read)).rejects.toThrow("state changed");
  expect(read).toHaveBeenCalledTimes(1);
  expect(request.mock.calls.every(([method, params]) => method === "workspace.run" && params.command === "git_management_snapshot")).toBe(true);
});
it("refuses binary or incomplete diff input before it becomes selectable", async () => {
  for (const bad of [{ binary: true }, { tooLarge: true }, { relative: "other" }]) {
    const request = vi.fn().mockResolvedValueOnce({ token: "a".repeat(64) }).mockResolvedValueOnce({ relative: "a.txt", original: "old\n", current: "new\n", binary: false, tooLarge: false, ...bad });
    await expect(selectiveReview({ request } as unknown as Pick<HostTransport, "request">, { projectId: "p", root: "/repo" }, "a.txt")).rejects.toThrow("complete text diff");
  }
});
