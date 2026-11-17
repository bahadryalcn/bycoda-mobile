import { describe, expect, it } from "vitest";
import {
  cloneDraftProblem,
  cloneParams,
  cloneProgressLabel,
  cloneUrlProblem,
  inferCloneName,
} from "./clone-model";

describe("clone model", () => {
  it("accepts network git URLs only", () => {
    for (const ok of ["https://github.com/a/b.git", "ssh://git@h/a/b", "git://h/a", "git@github.com:a/b.git"])
      expect(cloneUrlProblem(ok)).toBe(false);
    for (const bad of ["", "-x", "--upload-pack=x", "file:///x", "/tmp/x", "https://h/a b"])
      expect(cloneUrlProblem(bad)).toBe(true);
  });
  it("infers the repository name", () => {
    expect(inferCloneName("https://github.com/a/b.git")).toBe("b");
    expect(inferCloneName("git@github.com:a/tool/")).toBe("tool");
    expect(inferCloneName("https://h/..")).toBeNull();
  });
  it("reports the first blocking problem", () => {
    expect(cloneDraftProblem({ url: "nope", name: "" })).toBe("url");
    expect(cloneDraftProblem({ url: "https://h/a/b", name: "a/b" })).toBe("name");
    expect(cloneDraftProblem({ url: "https://h/a/b", name: "" })).toBeNull();
  });
  it("omits an empty name from the params", () => {
    expect(cloneParams({ url: " https://h/a/b ", name: "" }, "/p", "op")).toEqual({
      url: "https://h/a/b",
      parentPath: "/p",
      operationId: "op",
    });
  });
  it("labels running progress only", () => {
    expect(cloneProgressLabel({ state: "running", phase: "Receiving objects", percent: 45 })).toBe(
      "Receiving objects 45%",
    );
    expect(cloneProgressLabel({ state: "done", phase: "Done", percent: 100 })).toBeNull();
  });
});
