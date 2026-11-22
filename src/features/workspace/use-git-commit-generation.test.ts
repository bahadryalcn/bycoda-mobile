// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useGitCommitGeneration } from "./use-git-commit-generation";
import type { GitDiffIndex } from "./wire";

const mocks = vi.hoisted(() => ({
  client: { request: vi.fn() },
  token: 1,
  check: vi.fn(() => true),
}));
vi.mock("@/state/queries", () => ({ useHostClient: () => mocks.client }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ token: mocks.token, isCurrent: mocks.check }) }));
vi.mock("@/ui/private-access", () => ({ usePrivateContentAccess: () => ({ allowed: true, check: mocks.check }) }));

let root: ReturnType<typeof createRoot>;
let generation: ReturnType<typeof useGitCommitGeneration>;
const index: GitDiffIndex = {
  files: [{ path: "/repo/example.txt", relative: "example.txt", status: "M", staged: false, unstaged: true, additions: 1, deletions: 0 }],
  branch: "feature", head: "old", remote: null, upstream: null, ahead: 0, behind: 0,
  additions: 1, deletions: 0, defaultBranch: "main", aheadOfDefault: 0, headPushed: false,
};

function Probe({ cwd, diff = index }: { cwd: string; diff?: GitDiffIndex | null }) {
  generation = useGitCommitGeneration({ projectId: "project", cwd, root: cwd }, diff ?? undefined);
  return null;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.client.request.mockReset();
  mocks.check.mockReturnValue(true);
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(h(Probe, { cwd: "/repo" })));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("asks the scoped Host once and applies the result only on explicit review", async () => {
  const response = Promise.withResolvers<{ message: string }>();
  mocks.client.request.mockReturnValue(response.promise);
  const apply = vi.fn();
  await act(async () => { generation.start(); generation.start(); });
  expect(generation.pending).toBe(true);
  expect(mocks.client.request).toHaveBeenCalledExactlyOnceWith("git.generateText", {
    projectId: "project", cwd: "/repo", kind: "commit",
  }, expect.objectContaining({ retry: false }));

  await act(async () => response.resolve({ message: "Record checkout update" }));
  expect(generation.suggestion).toBe("Record checkout update");
  expect(apply).not.toHaveBeenCalled();
  await act(async () => generation.useSuggestion(apply));
  expect(apply).toHaveBeenCalledExactlyOnceWith("Record checkout update");
  expect(generation.suggestion).toBeUndefined();
});

it("cancels pending work and ignores the detached result after changing checkout", async () => {
  const response = Promise.withResolvers<{ message: string }>();
  mocks.client.request.mockReturnValue(response.promise);
  await act(async () => generation.start());
  const signal = mocks.client.request.mock.calls[0]?.[2]?.signal;
  await act(async () => root.render(h(Probe, { cwd: "/other" })));
  expect(signal.aborted).toBe(true);
  await act(async () => response.resolve({ message: "Wrong checkout suggestion" }));
  expect(generation.pending).toBe(false);
  expect(generation.suggestion).toBeUndefined();
});

it("leaves no stuck stop action when the diff becomes unavailable before the reply", async () => {
  const response = Promise.withResolvers<{ message: string }>();
  mocks.client.request.mockReturnValueOnce(response.promise);
  await act(async () => generation.start());
  const conflicted = { ...index, files: [] };
  await act(async () => root.render(h(Probe, { cwd: "/repo", diff: conflicted })));
  await act(async () => response.resolve({ message: "Old result" }));
  await act(async () => root.render(h(Probe, { cwd: "/repo" })));
  expect(generation.pending).toBe(false);
  expect(generation.suggestion).toBeUndefined();
  mocks.client.request.mockResolvedValueOnce({ message: "New result" });
  await act(async () => generation.start());
  expect(generation.suggestion).toBe("New result");
});
