import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { invalidateProjectPrivacy, projectPrivacyKey, projectVisibilityDenied, projectVisibilityExpired, observeProjectPrivacy } from "./project-privacy-cache";
it("expires only project visibility proof without deleting drafts/transcripts or fetching in the background", async () => {
  const cache = new QueryClient();
  const directory = projectPrivacyKey("machine", true); const legacy = projectPrivacyKey("machine", false); const transcript = ["machine", "machine", "session", "session"];
  cache.setQueryData(directory, { privacyReady: true, projects: [{ id: "private" }] }); cache.setQueryData(legacy, [{ id: "visible" }]); cache.setQueryData(transcript, { text: "Preserved" });
  await invalidateProjectPrivacy(cache);
  expect(cache.getQueryState(directory)?.isInvalidated).toBe(true); expect(cache.getQueryState(legacy)?.isInvalidated).toBe(true);
  expect(cache.getQueryState(transcript)?.isInvalidated).toBe(false); expect(cache.getQueryData(transcript)).toEqual({ text: "Preserved" });
  expect(cache.isFetching()).toBe(0); cache.setQueryData(directory, { privacyReady: true, projects: [] }); expect(cache.getQueryState(directory)?.isInvalidated).toBe(false); cache.clear();
});
it("a pre-lock in-flight response cannot clear expired proof, while a fresh post-resume read can", async () => {
  const cache = observeProjectPrivacy(new QueryClient()); const key = projectPrivacyKey("machine", true);
  cache.setQueryData(key, { privacyReady: true, projects: [{ id: "formerly-visible" }] });
  let finish!: (value: unknown) => void;
  const flight = cache.fetchQuery({ queryKey: key, queryFn: () => new Promise((resolve) => { finish = resolve; }), staleTime: 0 }).catch(() => undefined);
  const duringCancel: boolean[] = [];
  const unsubscribe = cache.getQueryCache().subscribe(event => {
    if (event.type === "updated" && event.action.type === "setState" && event.query.state.fetchStatus === "idle") duringCancel.push(projectVisibilityExpired(cache, key));
  });
  await invalidateProjectPrivacy(cache, "machine");
  unsubscribe(); expect(duringCancel).not.toContain(false); expect(projectVisibilityExpired(cache, key)).toBe(true);
  finish({ privacyReady: true, projects: [{ id: "stale-private" }] }); await flight;
  expect(cache.getQueryState(key)?.isInvalidated).toBe(true); expect(cache.getQueryData(key)).toEqual({ privacyReady: true, projects: [{ id: "formerly-visible" }] });
  await cache.fetchQuery({ queryKey: key, queryFn: async () => ({ privacyReady: true, projects: [] }) });
  expect(cache.getQueryState(key)?.isInvalidated).toBe(false); expect(cache.getQueryData(key)).toEqual({ privacyReady: true, projects: [] }); cache.clear();
});
it("retains batched denial without any mounted directory and isolates cache-entry lifetimes", () => {
  const cache = observeProjectPrivacy(new QueryClient()), key = projectPrivacyKey("machine", true);
  expect(projectVisibilityDenied(cache, key)).toBe(true); cache.setQueryData(key, { private: "old" });
  const old = cache.getQueryCache().find({ queryKey: key, exact: true })!;
  old.setState({ status: "error", error: Object.assign(Error("denied"), { kind: "identity" }) });
  old.setState({ status: "error", error: Error("network") }); expect(projectVisibilityDenied(cache, key)).toBe(true);
  cache.removeQueries({ queryKey: key, exact: true }); expect(projectVisibilityDenied(cache, key)).toBe(true);
  cache.setQueryData(key, { private: "new" }); expect(projectVisibilityDenied(cache, key)).toBe(false);
  old.setState({ status: "error", error: Object.assign(Error("late denied old owner"), { kind: "auth" }) });
  expect(projectVisibilityDenied(cache, key)).toBe(false); expect(cache.getQueryData(key)).toEqual({ private: "new" }); cache.clear();
});
it("isolates computers, clients and unrelated query families without changing cache contents", () => {
  const a = observeProjectPrivacy(new QueryClient()), b = observeProjectPrivacy(new QueryClient());
  const key = projectPrivacyKey("a", false), other = projectPrivacyKey("b", false), session = ["machine", "a", "session", "one"];
  for (const cache of [a, b]) for (const entry of [key, other, session]) cache.setQueryData(entry, "preserved");
  a.getQueryCache().find({ queryKey: session, exact: true })!.setState({ status: "error", error: Object.assign(Error("session denied"), { kind: "auth" }) });
  expect(projectVisibilityDenied(a, key)).toBe(false);
  const owner = a.getQueryCache().find({ queryKey: key, exact: true })!;
  owner.setState({ status: "error", error: Object.assign(Error("denied"), { kind: "auth" }) }); owner.setState({ status: "error", error: Error("network") });
  expect(projectVisibilityDenied(a, key)).toBe(true); expect(projectVisibilityDenied(a, other)).toBe(false); expect(projectVisibilityDenied(b, key)).toBe(false);
  expect(a.getQueryData(key)).toBe("preserved"); expect(a.getQueryData(session)).toBe("preserved"); expect(a.isFetching()).toBe(0); a.clear(); b.clear();
});
