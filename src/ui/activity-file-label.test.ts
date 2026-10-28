import { expect, it } from "vitest";
import { activityFileLabel } from "./activity-file-label";

it("leads with the distinguishing filename on Windows, POSIX and relative file activities", () => {
  expect(activityFileLabel("Read G:\\Projects\\mobile\\src\\features\\one.tsx")).toEqual({ title: "Read one.tsx", directory: "G:\\Projects\\mobile\\src\\features\\" });
  expect(activityFileLabel("Edit /Users/name/project/two.ts:10:2")).toEqual({ title: "Edit two.ts:10:2", directory: "/Users/name/project/" });
  expect(activityFileLabel("src/another/three.test.ts")).toEqual({ title: "three.test.ts", directory: "src/another/" });
});

it("does not reinterpret URLs, commands, prose, directory paths or ordinary titles", () => {
  for (const title of ["https://example.com/file.ts", "rg src/file.ts", "Thinking about file.ts", "Read src/folder/", "Read source", "Plan the changes"])
    expect(activityFileLabel(title)).toEqual({ title });
});
