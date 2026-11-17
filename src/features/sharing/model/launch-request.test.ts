import { beforeEach, describe, expect, it } from "vitest";

import {
  launchFromParams,
  launchFromShare,
  matchLaunchProject,
  mergeLaunch,
  useLaunchRequest,
} from "./launch-request";

describe("launchFromParams", () => {
  it("accepts a bounded prompt with an optional project", () => {
    expect(launchFromParams({ prompt: "fix it", project: "p1" })).toEqual({
      text: "fix it",
      project: "p1",
      files: [],
    });
    expect(launchFromParams({ prompt: "fix it" })).toEqual({ text: "fix it", files: [] });
  });
  it("rejects missing, blank, oversized and control-character prompts", () => {
    for (const prompt of [undefined, "  ", "x".repeat(8001), "a\u0000b", 5])
      expect(launchFromParams({ prompt })).toBeNull();
  });
});

describe("launchFromShare", () => {
  it("joins text and a separate link, and keeps only file or content uris", () => {
    const request = launchFromShare({
      text: "look",
      webUrl: "https://example.com",
      files: [
        { path: "file:///c/a%20b.png", mimeType: "image/png" },
        { path: "content://media/1", fileName: "doc.pdf", mimeType: "application/pdf" },
        { path: "https://evil.example/x" },
        { path: null },
      ],
    });
    expect(request?.text).toBe("look\n\nhttps://example.com");
    expect(request?.files).toEqual([
      { uri: "file:///c/a%20b.png", name: "a b.png", mimeType: "image/png" },
      { uri: "content://media/1", name: "doc.pdf", mimeType: "application/pdf" },
    ]);
  });
  it("does not repeat a link already in the text and ignores empty shares", () => {
    expect(launchFromShare({ text: "see https://a.io", webUrl: "https://a.io" })?.text).toBe("see https://a.io");
    expect(launchFromShare({ text: " ", files: [] })).toBeNull();
  });
  it("caps files", () => {
    const files = Array.from({ length: 12 }, (_, at) => ({ path: `file:///f${at}` }));
    expect(launchFromShare({ files })?.files).toHaveLength(7);
  });
});

describe("mergeLaunch and the queue", () => {
  beforeEach(() => useLaunchRequest.getState().clear());
  it("keeps earlier text, ignores a repeated one and prefers the newer project", () => {
    const first = { text: "one", project: "a", files: [] };
    const merged = mergeLaunch(first, { text: "two", project: "b", files: [] });
    expect(merged).toEqual({ text: "one\n\ntwo", project: "b", files: [] });
    expect(mergeLaunch(merged, { text: "two", files: [] }).text).toBe("one\n\ntwo");
    expect(mergeLaunch(merged, { text: "two", files: [] }).project).toBe("b");
  });
  it("take empties the queue", () => {
    useLaunchRequest.getState().queue({ text: "x", files: [] });
    useLaunchRequest.getState().queue({ text: "x", files: [] });
    expect(useLaunchRequest.getState().take()).toEqual({ text: "x", files: [] });
    expect(useLaunchRequest.getState().take()).toBeNull();
  });
});

describe("matchLaunchProject", () => {
  const projects = [
    { id: "p1", name: "Api" },
    { id: "p2", name: "Web" },
    { id: "p3", name: "web" },
  ];
  it("matches id first, then a unique name", () => {
    expect(matchLaunchProject(projects, "p2")?.id).toBe("p2");
    expect(matchLaunchProject(projects, "api")?.id).toBe("p1");
    expect(matchLaunchProject(projects, "WEB")).toBeUndefined();
    expect(matchLaunchProject(projects, undefined)).toBeUndefined();
  });
});
