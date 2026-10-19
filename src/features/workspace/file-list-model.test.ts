import { expect, it } from "vitest";
import {
  defaultFileListOptions,
  fileParentPath,
  isHiddenFilePath,
  visibleFileEntries,
} from "./file-list-model";
import type { FileEntry } from "./wire";

const file = (path: string, extra: Partial<FileEntry> = {}): FileEntry => ({
  name: path.replaceAll("\\", "/").split("/").at(-1)!,
  path,
  isDir: false,
  ignored: false,
  ...extra,
});

it("keeps folders first and naturally orders names without mutating host results", () => {
  const entries = [file("file10.ts"), file("file2.ts"), file("src", { isDir: true })];
  expect(visibleFileEntries(entries, defaultFileListOptions).map((entry) => entry.path)).toEqual([
    "src",
    "file2.ts",
    "file10.ts",
  ]);
  expect(
    visibleFileEntries(entries, { ...defaultFileListOptions, order: "descending" }).map(
      (entry) => entry.path,
    ),
  ).toEqual(["src", "file10.ts", "file2.ts"]);
  expect(entries[0]?.path).toBe("file10.ts");
});

it("applies visibility filters to nested search results and always excludes Git internals", () => {
  const entries = [
    file(".git/config"),
    file("src\\.git\\HEAD"),
    file(".github/workflows/ci.yml"),
    file(".env"),
    file("dist/app.js", { ignored: true }),
    file("src/app.ts"),
  ];
  expect(visibleFileEntries(entries, defaultFileListOptions)).toHaveLength(4);
  expect(
    visibleFileEntries(entries, {
      ...defaultFileListOptions,
      showHidden: false,
      showIgnored: false,
    }),
  ).toEqual([entries.at(-1)]);
});

it("recognizes hidden path segments and computes parent folders on both host platforms", () => {
  expect(isHiddenFilePath("src/.cache/result.json")).toBe(true);
  expect(isHiddenFilePath("src/my.component.tsx")).toBe(false);
  expect(fileParentPath("src\\features\\chat")).toBe("src/features");
  expect(fileParentPath("src")).toBe("");
  expect(fileParentPath("")).toBe("");
});
