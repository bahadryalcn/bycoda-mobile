// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SocialSnapshot } from "@/domain/types";
import type { SocialTab } from "../social-flow";
import { useSocialWorkspace } from "./use-workspace-query";

const fixture = vi.hoisted(() => ({
  machine: { id: "machine", endpoint: "https://one.example", environmentId: "environment", lanKey: "private-key" },
  data: undefined as SocialSnapshot | undefined,
  key: [] as readonly unknown[], params: {} as Record<string, unknown>,
  options: {} as { enabled?: boolean; queryFn?: (client: { request: (...args: unknown[]) => Promise<unknown> }, signal: AbortSignal) => Promise<SocialSnapshot> },
  serial: 0,
  listeners: new Set<() => void>(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => `scope-${++fixture.serial}` }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => fixture.machine,
  useMachines: { getState: () => ({ activeId: fixture.machine.id, machines: [fixture.machine] }),
    subscribe:(listener:()=>void)=>{fixture.listeners.add(listener);return()=>fixture.listeners.delete(listener);} },
}));
vi.mock("@/state/queries", () => ({ useHostQuery: (key: readonly unknown[], _method: string, params: Record<string, unknown>, options: typeof fixture.options) => {
  fixture.key = key; fixture.params = params; fixture.options = options;
  return { data: fixture.data, isError: false, error: null, isFetching: false };
} }));

let root: ReturnType<typeof createRoot>;
let current: ReturnType<typeof useSocialWorkspace>;
let projectId = "project";
let tab:SocialTab="inbox";
function Harness() { current = useSocialWorkspace(tab, projectId); return null; }
async function render() { await act(async () => root.render(createElement(Harness))); }
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.machine = { id: "machine", endpoint: "https://one.example", environmentId: "environment", lanKey: "private-key" };
  fixture.data = undefined;
  projectId = "project";tab="inbox";
  root = createRoot(document.createElement("div"));
});

it("keeps independent search and host page for each collection across tab switches",async()=>{
 await render();await act(async()=>current.page!.setSearch("inbox needle"));await act(async()=>vi.advanceTimersByTime(300));
 await act(async()=>current.page!.onOffset(40));const oldInbox=current.page!;
 tab="drafts";await render();expect(current.page!.search).toBe("");
 await act(async()=>current.page!.setSearch("draft needle"));await act(async()=>vi.advanceTimersByTime(300));
 await act(async()=>current.page!.onOffset(20));
 await act(async()=>oldInbox.setSearch("stale inbox event"));expect(current.page!.search).toBe("draft needle");
 tab="inbox";await render();expect(current.page!.search).toBe("inbox needle");
 expect(fixture.params.input).toMatchObject({offsets:{threads:40},filters:{threads:{query:"inbox needle"}}});
 tab="accounts";await render();expect(current.page).toBeUndefined();
 tab="drafts";await render();expect(current.page!.search).toBe("draft needle");
 expect(fixture.params.input).toMatchObject({offsets:{drafts:20},filters:{drafts:{query:"draft needle"}}});
});

it("retains an uncommitted search across a fast tab round trip and resets both collections on project change",async()=>{
 await render();await act(async()=>current.page!.setSearch("pending needle"));
 tab="drafts";await render();await act(async()=>vi.advanceTimersByTime(350));
 tab="inbox";await render();expect(current.page!.search).toBe("pending needle");expect(fixture.options.enabled).toBe(false);
 await act(async()=>vi.advanceTimersByTime(300));expect(fixture.options.enabled).toBe(true);
 projectId="other";await render();expect(current.page!.search).toBe("");
 projectId="project";await render();expect(current.page!.search).toBe("");
});

it("clears all retained collection controls across batched connection replacement and rejects stale callbacks",async()=>{
 await render();await act(async()=>current.page!.setSearch("old search"));await act(async()=>vi.advanceTimersByTime(300));
 const old=current.page!;const original=fixture.machine;
 await act(async()=>{
  fixture.machine={...original,endpoint:"https://two.example"};fixture.listeners.forEach(notify=>notify());
  fixture.machine=original;fixture.listeners.forEach(notify=>notify());
  old.setSearch("late old event");
 });
 expect(current.page!.search).toBe("");expect(fixture.params.input).toMatchObject({offsets:{threads:0}});
});

it("rejects an in-flight snapshot after a batched A/B/A connection event",async()=>{
 await render();let resolve!:(value:unknown)=>void;
 const pending=fixture.options.queryFn!({request:()=>new Promise(done=>{resolve=done;})},new AbortController().signal).catch(error=>error);
 const original=fixture.machine;
 await act(async()=>{
  fixture.machine={...original,lanKey:"replacement-key"};fixture.listeners.forEach(notify=>notify());
  fixture.machine=original;fixture.listeners.forEach(notify=>notify());
 });
 resolve({cursor:"old",unchanged:false,snapshot:{}});
 expect(await pending).toMatchObject({code:"scope"});expect(current.state).toBeUndefined();
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("debounces valid global filters, resets the host page and never enables an oversized search", async () => {
  await render();
  await act(async () => current.page!.onOffset(40));
  expect(fixture.params.input).toMatchObject({ offsets: { threads: 40 } });
  await act(async () => current.page!.setSearch("needle"));
  expect(fixture.options.enabled).toBe(false);
  await act(async () => vi.advanceTimersByTime(299));
  expect(fixture.options.enabled).toBe(false);
  await act(async () => vi.advanceTimersByTime(1));
  expect(fixture.options.enabled).toBe(true);
  expect(fixture.params.input).toMatchObject({ offsets: { threads: 0 }, filters: { threads: { query: "needle" } } });
  await act(async () => current.page!.setSearch("x".repeat(1001)));
  await act(async () => vi.advanceTimersByTime(1000));
  expect(fixture.options.enabled).toBe(false);
  expect(current.page!.invalidSearch).toBe(true);
  expect(current.page!.search).toHaveLength(1001);
});

it("does not reuse a connection scope or cache when the same saved machine is paired to another identity", async () => {
  await render();
  const firstKey = JSON.stringify(fixture.key);
  expect(firstKey).not.toContain("private-key");
  fixture.machine = { ...fixture.machine, endpoint: "https://two.example", lanKey: "another-private-key" };
  await render();
  expect(JSON.stringify(fixture.key)).not.toBe(firstKey);
  expect(JSON.stringify(fixture.key)).not.toContain("another-private-key");
  expect(current.state).toBeUndefined();
  expect(current.page!.loading).toBe(true);
});

it("never shows another project's retained snapshot under the current input, but keeps the same input's", async () => {
  const pages = Object.fromEntries(["campaigns", "publishingPlans", "threads", "contacts", "rules", "jobs", "drafts"]
    .map((key) => [key, { offset: 0, limit: 20, total: 0 }]));
  const snapshot = { executorId: "environment", hostOnline: true, accounts: [], profiles: [], campaigns: [], publishingPlans: [],
    threads: [], contacts: [], rules: [], jobs: [], drafts: [], pages } as unknown as SocialSnapshot;
  await render();
  const client = { request: async () => ({ cursor: "revision", unchanged: false, snapshot }) };
  await act(async () => { await fixture.options.queryFn!(client, new AbortController().signal); });
  await render();
  expect(current.state).toBe(snapshot);
  projectId = "other";
  await render();
  expect(current.state).toBeUndefined();
  expect(current.page!.loading).toBe(true);
  projectId = "project";
  await render();
  expect(current.state).toBe(snapshot);
});
