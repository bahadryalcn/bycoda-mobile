import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { invalidateProjectPrivacy, projectPrivacyKey } from "./project-privacy-cache";
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
  const cache = new QueryClient(); const key = projectPrivacyKey("machine", true);
  cache.setQueryData(key, { privacyReady: true, projects: [{ id: "formerly-visible" }] });
  let finish!: (value: unknown) => void;
  const flight = cache.fetchQuery({ queryKey: key, queryFn: () => new Promise((resolve) => { finish = resolve; }), staleTime: 0 }).catch(() => undefined);
  await invalidateProjectPrivacy(cache, "machine");
  finish({ privacyReady: true, projects: [{ id: "stale-private" }] }); await flight;
  expect(cache.getQueryState(key)?.isInvalidated).toBe(true); expect(cache.getQueryData(key)).toEqual({ privacyReady: true, projects: [{ id: "formerly-visible" }] });
  await cache.fetchQuery({ queryKey: key, queryFn: async () => ({ privacyReady: true, projects: [] }) });
  expect(cache.getQueryState(key)?.isInvalidated).toBe(false); expect(cache.getQueryData(key)).toEqual({ privacyReady: true, projects: [] }); cache.clear();
});
