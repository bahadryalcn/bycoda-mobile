// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { HistoryImport } from "./history-import";
const f = vi.hoisted(() => ({
  activeId: "machine", allowed:true, epoch:true, paused:false, queryError:null as Error|null, dismiss:null as (()=>void)|null, preview:null as unknown as typeof preview, status:undefined as unknown, statusRead:vi.fn(), saveGate:null as Promise<void>|null, commands:new Map<string,()=>void>(),
  raw: null as string | null,
  scans: vi.fn(),
  send: vi.fn(async () => ({ state: "running" })),
  confirmation: null as (() => void) | null,
}));
const preview = {
  reviewId: "review",
  digest: "a".repeat(64),
  expiresAt: Date.now() + 300000,
  environmentId: "env",
  sourceSessionId: "source",
  omitted: 0,
  candidates: [
    {
      id: "candidate",
      provider: "codex",
      prompt: "Example history",
      startedAt: 1,
      lastAt: 2,
      sizeBytes: 100,
      resumable: true,
      kind: "interactive",
      imported: false,
    },
  ],
};
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "operation" }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => f.raw,
    setItem: async (_key: string, value: string) => {
      f.raw = value; if(f.saveGate)await f.saveGate;
    },
    removeItem: async () => {
      f.allowed=true;f.epoch=true;f.paused=false;f.queryError=null;f.dismiss=null;f.status=undefined;f.saveGate=null;f.commands.clear();
  f.raw = null;
    },
  },
}));
vi.mock("@/state/connection-scope",()=>{const scope={isCurrent:()=>f.epoch};return{useConnectionScope:()=>scope};});
vi.mock("@/ui/private-access",()=>({usePrivateContentAccess:()=>({allowed:f.allowed,check:()=>f.allowed}),PrivateContentAccessProvider:({children}:PropsWithChildren)=>children}));
vi.mock("@/ui/search-field",()=>({CollectionToolbar:({field,actions}:any)=>createElement("section",null,field,actions)}));
vi.mock("@/ui/action-review-sheet",()=>({ActionReviewSheet:({children,onConfirm,onClose}:PropsWithChildren<{onConfirm:()=>void;onClose:()=>void}>)=>{f.confirmation=onConfirm;f.dismiss=onClose;return createElement("aside",null,children);}}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({
    id: "machine",
    name: "Computer",
    environmentId: "env",
    capabilities: ["history.import.desktop.v1"],
  }),
  useMachines: {
    getState: () => ({ activeId: f.activeId, machines: [{ id: "machine", environmentId: "env" }] }),
  },
}));
vi.mock("@/state/queries", () => ({
  useHostMutation: () => ({ mutateAsync: f.send }),
  useHostQuery: (key: string[]) =>
    key[0] === "history-import-preview"
      ? {
          refetch: async () => {
            f.scans();
            return { data: f.preview };
          },
          isEnabled:false, fetchStatus:f.paused?"paused":"idle",error:f.queryError,
          isFetching: false,
        }
      : {
          data: f.status, error:f.queryError,fetchStatus:f.paused?"paused":"idle",
          refetch: async () => {f.statusRead();return { data:f.status?? { state: "unknown" } };},
          isFetching: false,
        },
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/confirm", () => ({
  confirmAction: (_a: string, _b: string, _c: string, action: () => void) => {
    f.confirmation = action;
  },
}));
vi.mock("@/ui/primitives", () => {
  const box = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Stack:box, Disclosure:box, Body: box,
    ActionMenu:({actions}:any)=>createElement("nav",null,...actions.filter(Boolean).map((a:any)=>{f.commands.set(a.label,a.onPress);return createElement("button",{key:a.key,disabled:a.disabled,onClick:a.onPress},a.label);})),
    Sheet: ({ children, footer, visible = true }: PropsWithChildren<{ footer: unknown;visible?:boolean }>) =>
      visible?createElement("div", null, children, footer as never):null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message), StateView: ({ title }: { title: string }) => createElement("p", null, title),
    QueryState: () => null,
    ErrorText: () => null,
    ScreenList: ({
      data,
      header,
      renderItem,
    }: {
      data: unknown[];
      header: unknown;
      renderItem: (input: { item: unknown }) => unknown;
    }) =>
      createElement(
        "div",
        null,
        header as never,
        ...data.map((item) => renderItem({ item }) as never),
      ),
    Button: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled: boolean;
      onPress: () => void;
    }) => {f.commands.set(label,onPress);return createElement("button", { disabled, onClick: onPress }, label);},
    ToggleField: ({
      label,
      disabled,
      value,
      onChange,
    }: {
      label: string;
      disabled: boolean;
      value: boolean;
      onChange: (value: boolean) => void;
    }) => createElement("button", { disabled, onClick: () => onChange(!value) }, label),
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
async function mount() {
  f.preview=structuredClone(preview);f.preview.expiresAt=Date.now()+300000;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(HistoryImport, {
        scope: { machineId: "machine", sessionId: "source" },
        projectId: "project",
        onClose: vi.fn(),
      }),
    ),
  );
}
async function click(label: string) {
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === label)!
      .click(),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.clearAllMocks();vi.restoreAllMocks();
  vi.unstubAllGlobals();
  f.raw = null;
  f.confirmation = null;
  f.activeId = "machine";
});
it("opens without scanning; explicit review and confirmation persist one receipt before one import", async () => {
  await mount();
  expect(f.scans).not.toHaveBeenCalled();
  expect(f.send).not.toHaveBeenCalled();
  await click("Scan this project's history");
  await click("Example history");
  await click("Import history");
  expect(f.send).not.toHaveBeenCalled();
  await act(async () => f.confirmation!());
  expect(f.raw).toContain('"operationId":"operation"');
  expect(f.send).toHaveBeenCalledExactlyOnceWith({
    projectId: "project",
    sessionId: "source",
    reviewId: "review",
    digest: "a".repeat(64),
    candidateIds: ["candidate"],
    operationId: "operation",
  });
  expect([...container.querySelectorAll("button")].some(b=>b.textContent==="Import history")).toBe(false);
  expect(f.send).toHaveBeenCalledTimes(1);
});
it("reopening a durable unknown attempt never scans or resends and exposes only status recovery", async () => {
  f.raw = JSON.stringify({ operationId: "previous", digest: "a".repeat(64), environmentId: "env" });
  await mount();
  expect(f.scans).not.toHaveBeenCalled();
  expect(f.send).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Check import status");
  expect([...container.querySelectorAll("button")].some(b=>b.textContent==="Import history")).toBe(false);
});
it("a delayed confirmation after changing computers cannot create or send an attempt", async () => {
  await mount();
  await click("Scan this project's history");
  await click("Example history");
  await click("Import history");
  f.activeId = "other";
  await act(async () => f.confirmation!());
  expect(f.raw).toBeNull();
  expect(f.send).not.toHaveBeenCalled();
});

async function rerender(projectId = "project", sessionId = "source") {
  await act(async () => root.render(createElement(HistoryImport, { scope: { machineId: "machine", sessionId }, projectId, onClose: vi.fn() })));
}
async function reviewOne() { await mount(); await click("Scan this project's history"); await click("Example history"); await click("Import history"); }
it("reviews only selected full conversation metadata and Cancel preserves selection without creating a receipt", async () => {
  await mount(); f.preview.candidates.push({ ...preview.candidates[0]!, id: "other", prompt: "Not selected" }); await click("Scan this project's history");
  await click("Example history"); await click("Import history"); const old = f.confirmation!;
  expect(container.querySelector("aside")!.textContent).toContain("Example history"); expect(container.querySelector("aside")!.textContent).not.toContain("Not selected");
  expect(container.querySelector("aside")!.textContent).toContain("No provider is started."); await act(async () => f.dismiss!());
  await act(async () => old()); expect(f.raw).toBeNull(); expect(f.send).not.toHaveBeenCalled(); await click("Import history"); expect(container.querySelector("aside")).not.toBeNull();
});
it("Select all excludes imported records and Clear selection retires the staged review", async () => {
  await mount(); f.preview.candidates.push({ ...preview.candidates[0]!, id: "already", prompt: "Already done", imported: true }, { ...preview.candidates[0]!, id: "second", prompt: "Second available" });
  await click("Scan this project's history"); await click("Select all"); await click("Import history");
  expect(container.querySelector("aside")!.textContent).toContain("Second available"); expect(container.querySelector("aside")!.textContent).not.toContain("Already done"); const old = f.confirmation!;
  await act(async () => f.dismiss!()); await click("Clear selection"); await act(async () => old()); expect(f.raw).toBeNull(); expect(f.send).not.toHaveBeenCalled();
});
it("consumes a retained confirmation once and claims before import", async () => {
  await reviewOne(); const old = f.confirmation!; await act(async () => { old(); old(); }); expect(f.send).toHaveBeenCalledOnce(); expect(f.raw).toContain('"operationId":"operation"');
});
it("a changed selection retires the previous review", async () => {
  await reviewOne(); const old = f.confirmation!; await click("Example history"); expect(container.querySelector("aside")).toBeNull();
  await act(async () => old()); expect(f.raw).toBeNull(); expect(f.send).not.toHaveBeenCalled();
});
it.each(["access", "auth", "paused", "epoch", "project", "session"])("retires a retained confirmation through %s loss and restoration", async kind => {
  await reviewOne(); const old = f.confirmation!;
  if (kind === "access") f.allowed = false;
  if (kind === "auth") f.queryError = Object.assign(new Error("Unavailable"), { kind: "auth" });
  if (kind === "paused") f.paused = true;
  if (kind === "epoch") f.epoch = false;
  await rerender(kind === "project" ? "other" : "project", kind === "session" ? "other" : "source"); expect(container.querySelector("aside")).toBeNull();
  f.allowed = true; f.queryError = null; f.paused = false; f.epoch = true; await rerender(); await act(async () => old());
  expect(f.raw).toBeNull(); expect(f.send).not.toHaveBeenCalled();
});
it("does not create an attempt from a retained confirmation after unmount", async () => {
  await reviewOne(); const old = f.confirmation!; await act(async () => root.unmount()); await act(async () => old()); expect(f.raw).toBeNull(); expect(f.send).not.toHaveBeenCalled(); root = createRoot(container);
});
it("expiry before confirmation does not claim or send and makes rescan the active task", async () => {
  await reviewOne(); vi.spyOn(Date, "now").mockReturnValue(f.preview.expiresAt + 1); await act(async () => f.confirmation!());
  expect(f.raw).toBeNull(); expect(f.send).not.toHaveBeenCalled(); expect(container.textContent).toContain("History review expired");
  expect([...container.querySelectorAll("button")].filter(b => b.textContent === "Scan this project's history").some(b => !b.disabled)).toBe(true);
});
it("an expiry while the receipt claim is pending clears only the unsent claim", async () => {
  let resolve!: () => void; await reviewOne(); f.saveGate = new Promise<void>(r => { resolve = r; }); await act(async () => f.confirmation!()); expect(f.raw).not.toBeNull();
  vi.spyOn(Date, "now").mockReturnValue(f.preview.expiresAt + 1); await act(async () => resolve()); expect(f.raw).toBeNull(); expect(f.send).not.toHaveBeenCalled();
});
it("intervening access loss cannot resume an accepted import after its receipt claim resolves", async () => {
  let resolve!: () => void; await reviewOne(); f.saveGate = new Promise<void>(r => { resolve = r; }); await act(async () => f.confirmation!());
  f.allowed = false; await rerender(); f.allowed = true; await rerender(); await act(async () => resolve());
  expect(f.raw).toBeNull(); expect(f.send).not.toHaveBeenCalled();
});
it("an uncertain commit retains its durable receipt and offers status recovery instead of resend", async () => {
  f.send.mockRejectedValueOnce(Object.assign(new Error("Disconnected"), { uncertain: true })); await reviewOne(); await act(async () => f.confirmation!());
  expect(f.raw).toContain('"operationId":"operation"'); expect(container.textContent).toContain("Check import status");
  expect([...container.querySelectorAll("button")].some(b => b.textContent === "Import history")).toBe(false); expect(f.send).toHaveBeenCalledOnce();
});
it("does not query a durable receipt through a different environment", async () => {
  f.raw = JSON.stringify({ operationId: "previous", digest: "a".repeat(64), environmentId: "other-env" }); await mount();
  await act(async () => f.commands.get("Check import status")!()); expect(f.statusRead).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled(); expect(f.raw).toContain("previous");
});
it("ignores cached operation progress without a matching durable attempt", async () => {
  f.status = { state: "running", progress: { total: 20, done: 9, imported: 9, skipped: 0, failed: 0 } }; await mount();
  expect(container.textContent).not.toContain("Completed:"); expect(container.textContent).not.toContain("Stop importing"); expect(f.scans).not.toHaveBeenCalled();
});
it("a running receipt keeps Stop importing reachable without a new import action", async () => {
  f.raw = JSON.stringify({ operationId: "previous", digest: "a".repeat(64), environmentId: "env" }); f.status = { state: "running" }; await mount();
  expect(container.textContent).toContain("Stop importing"); expect([...container.querySelectorAll("button")].some(b => b.textContent === "Import history")).toBe(false);
  await click("Stop importing"); expect(f.send).toHaveBeenCalledExactlyOnceWith({ projectId: "project", sessionId: "source", operationId: "previous" });
});
