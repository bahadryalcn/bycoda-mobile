import { expect, it, vi } from "vitest";
import { sameSessionProjectFolder, SessionProjectMismatch } from "./session-project";

const mismatch = new SessionProjectMismatch("session", "legacy", "canonical");
function fixture(paths = ["/work/", "/work"]) {
  let current = true;
  const request = vi.fn(async (method: string, params: Record<string, unknown>) => {
    if (method === "projects.list")
      return paths.map((cwd, i) => ({ id: i ? "canonical" : "legacy", cwd }));
    if (method === "projects.browse") return { path: String(params.path).replace(/\/$/, "") };
    throw new Error("Unexpected mutation");
  });
  const client = {
    request: request as Parameters<typeof sameSessionProjectFolder>[0]["request"],
    assertCurrentAccess: () => {
      if (!current) throw new Error("Source changed");
    },
  };
  return {
    client,
    request,
    revoke: () => {
      current = false;
    },
  };
}
it("proves legacy aliases through Host folder reads, preserving the exact session and actual project", async () => {
  const f = fixture();
  expect(await sameSessionProjectFolder(f.client, mismatch, () => true)).toBe(true);
  expect(f.request.mock.calls.map(([method]) => method)).toEqual([
    "projects.list",
    "projects.browse",
    "projects.browse",
  ]);
  expect(mismatch).toMatchObject({
    sessionId: "session",
    expectedProjectId: "legacy",
    actualProjectId: "canonical",
  });
});
it("accepts identical Host-owned folder strings without extra reads", async () => {
  const f = fixture(["/work", "/work"]);
  expect(await sameSessionProjectFolder(f.client, mismatch, () => true)).toBe(true);
  expect(f.request).toHaveBeenCalledTimes(1);
});
it.each([
  ["/work", "/other"],
  ["/Work", "/work"],
  ["/work", "/work/child"],
])("never infers aliases from similar client paths %s %s", async (expected, actual) => {
  const f = fixture([expected, actual]);
  expect(await sameSessionProjectFolder(f.client, mismatch, () => true)).toBe(false);
});
it("does not read a hidden or removed project's folders", async () => {
  const f = fixture();
  expect(await sameSessionProjectFolder(f.client, mismatch, (id) => id === "legacy")).toBe(false);
  expect(f.request).not.toHaveBeenCalled();
});
it("fences visibility and original Host after a deferred list response", async () => {
  const f = fixture();
  f.request.mockImplementationOnce(async () => {
    f.revoke();
    return [];
  });
  await expect(sameSessionProjectFolder(f.client, mismatch, () => true)).rejects.toThrow(
    "Source changed",
  );
  expect(f.request).toHaveBeenCalledTimes(1);
});
it("refuses missing project records and aborts rather than registering a folder", async () => {
  const f = fixture();
  f.request.mockResolvedValueOnce([]);
  expect(await sameSessionProjectFolder(f.client, mismatch, () => true)).toBe(false);
  const controller = new AbortController();
  controller.abort();
  await expect(
    sameSessionProjectFolder(f.client, mismatch, () => true, controller.signal),
  ).rejects.toThrow();
  expect(f.request).toHaveBeenCalledTimes(1);
});

it("folds only the directory's named legacy ids into the listed project", async () => {
  const { foldSessionProject } = await import("./session-project");
  const read = { projectId: "legacy", revision: 1 };
  expect(foldSessionProject(read, "listed", ["legacy"])).toEqual({ projectId: "listed", revision: 1 });
  expect(foldSessionProject(read, "listed", ["other"])).toBe(read);
  expect(foldSessionProject(read, "listed", undefined)).toBe(read);
});
