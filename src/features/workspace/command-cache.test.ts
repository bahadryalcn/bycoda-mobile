import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { hostKey } from "@/state/host-request";
import { invalidateCommandQueries } from "./command-cache";
import { invalidateProjectPrivacy, projectPrivacyKey } from "./project-privacy-cache";

describe("session command refresh boundaries", () => {
  it("refreshes related content without concealing a proven workspace", async () => {
    const cache = new QueryClient();
    const proof = [projectPrivacyKey("pc-a", true), projectPrivacyKey("pc-a", false)];
    const content = [
      ["session", "session-a"],
      ["sessions", "project-a"],
      ["project-summaries"],
      ["session-queue", "session-a"],
      ["tasks"],
      ["goals"],
      ["git", "project-a"],
    ].map((scope) => hostKey("pc-a", scope));
    const other = hostKey("pc-b", ["session", "session-a"]);
    for (const key of [...proof, ...content, other]) cache.setQueryData(key, { retained: true });
    await invalidateCommandQueries(cache, "pc-a", [], {
      type: "configure",
      sessionId: "session-a",
      projectId: "project-a",
    });
    for (const key of proof) expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
    for (const key of content.slice(0, 3))
      expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of content.slice(3)) expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
    expect(cache.getQueryState(other)?.isInvalidated).toBe(false);
    expect(cache.getQueryData(content[0]!)).toEqual({ retained: true });
    await invalidateProjectPrivacy(cache, "pc-a");
    for (const key of proof) expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
    expect(cache.getQueryData(content[0]!)).toEqual({ retained: true });
    cache.clear();
  });

  it("retains a caller's narrower content scope", async () => {
    const cache = new QueryClient();
    const sessions = hostKey("pc-a", ["sessions", "project-a"]);
    const otherProject = hostKey("pc-a", ["sessions", "project-b"]);
    const unrelated = hostKey("pc-a", ["notes"]);
    for (const key of [sessions, otherProject, unrelated]) cache.setQueryData(key, []);
    await invalidateCommandQueries(cache, "pc-a", ["sessions", "project-a"]);
    expect(cache.getQueryState(sessions)?.isInvalidated).toBe(true);
    expect(cache.getQueryState(otherProject)?.isInvalidated).toBe(false);
    expect(cache.getQueryState(unrelated)?.isInvalidated).toBe(false);
    cache.clear();
  });
});

it("limits configure to reviewed session and project collections", async () => {
  const cache = new QueryClient();
  const scopes = [
    ["session", "session-a"],
    ["session", "session-b"],
    ["sessions", "project-a"],
    ["sessions", "project-b"],
    ["project-summaries", ["project-a"]],
    ["project-summaries", ["project-b"]],
    ["session-queue", "session-a"],
  ];
  for (const scope of scopes) cache.setQueryData(hostKey("pc", scope), {});
  await invalidateCommandQueries(cache, "pc", ["session", "session-a", "project-a"], {
    type: "configure",
    sessionId: "session-a",
  });
  expect(scopes.map((scope) => cache.getQueryState(hostKey("pc", scope))?.isInvalidated)).toEqual([
    true,
    false,
    true,
    false,
    true,
    false,
    false,
  ]);
  cache.clear();
});
