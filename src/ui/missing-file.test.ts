import { describe, expect, it, vi } from "vitest";
import { relocateMissingFile } from "./missing-file";

const context = (stat: unknown, entries: unknown = []) => {
  const request = vi.fn(async (method: string, _params: unknown, _options?: unknown) => (method === "workspace.run" ? stat : entries));
  return { request, value: { client: { request } as never, projectId: "p1", cwd: "C:\\work\\site" } };
};

describe("relocateMissingFile", () => {
  it("keeps the original failure when the file exists", async () => {
    const { value, request } = context([{ path: "C:/work/site/a.html", mtimeMs: 1, isDir: false }]);
    await expect(relocateMissingFile(value, "C:/work/site/a.html")).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]).toEqual(["workspace.run", { command: "stat_files", args: { paths: ["C:/work/site/a.html"] } }, { signal: undefined }]);
  });

  it("finds a bare file name in a project subfolder", async () => {
    const { value, request } = context([{ path: "C:/work/site/Spec.html", mtimeMs: null, isDir: false }], [
      { name: "spec.html", path: "docs/out/spec.html", isDir: false, ignored: false },
    ]);
    await expect(relocateMissingFile(value, "C:/work/site/Spec.html")).resolves.toBe("C:/work/site/docs/out/spec.html");
    expect(request.mock.calls[1]?.[1]).toEqual({ projectId: "p1", cwd: "C:\\work\\site", query: "Spec.html" });
  });

  it("reports a missing file when nothing or several files match", async () => {
    await expect(relocateMissingFile(context([{ path: "x", mtimeMs: null }]).value, "C:/work/site/a.html")).resolves.toBeNull();
    const several = context([{ path: "x", mtimeMs: null }], [
      { name: "a.html", path: "one/a.html", isDir: false, ignored: false },
      { name: "a.html", path: "two/a.html", isDir: false, ignored: false },
    ]);
    await expect(relocateMissingFile(several.value, "C:/work/site/a.html")).resolves.toBeNull();
  });

  it("matches a relative path nested deeper, never a different file with the same name", async () => {
    const nested = context([{ path: "x", mtimeMs: null }], [
      { name: "a.html", path: "app/docs/a.html", isDir: false, ignored: false },
      { name: "a.html", path: "other/a.html", isDir: false, ignored: false },
    ]);
    await expect(relocateMissingFile(nested.value, "C:/work/site/docs/a.html")).resolves.toBe("C:/work/site/app/docs/a.html");
  });

  it("never claims a file is missing from unreadable metadata", async () => {
    await expect(relocateMissingFile(context(null).value, "C:/work/site/a.html")).resolves.toBeUndefined();
  });
});
