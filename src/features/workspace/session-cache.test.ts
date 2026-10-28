import { expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { pruneInactiveSessionCache } from "./session-cache";

const key = (id: string) => ["machine", "host", "session", id];
const value = (id: string, text = "Hello") => ({
  session: { id, blocks: [{ id: "message", text }] },
});

it("bounds inactive sessions while preserving an active observer and separate draft state", () => {
  const cache = new QueryClient();
  for (let index = 0; index < 5; index++)
    cache.setQueryData(key(String(index)), value(String(index)), { updatedAt: index + 1 });
  const draftKey = ["draft", "host", "0"];
  cache.setQueryData(draftKey, { text: "Unsent draft" });
  const observer = new QueryObserver(cache, { queryKey: key("0"), enabled: false });
  const unsubscribe = observer.subscribe(() => {});
  try {
    pruneInactiveSessionCache(cache);
    expect(cache.getQueryData(key("0"))).toBeDefined();
    expect(cache.getQueryData(key("1"))).toBeUndefined();
    expect(cache.getQueryData(key("4"))).toBeDefined();
    expect(cache.getQueryData(draftKey)).toEqual({ text: "Unsent draft" });
  } finally {
    unsubscribe();
    cache.clear();
  }
});

it("releases one oversized inactive transcript including nested tool payloads", () => {
  const cache = new QueryClient();
  cache.setQueryData(key("huge"), {
    session: { blocks: [{ tool: { preview: { nested: "x".repeat(5 * 1024 * 1024) } } }] },
  });
  cache.setQueryData(key("small"), value("small"));
  pruneInactiveSessionCache(cache);
  expect(cache.getQueryData(key("huge"))).toBeUndefined();
  expect(cache.getQueryData(key("small"))).toBeDefined();
  cache.clear();
});
