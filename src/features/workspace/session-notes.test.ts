// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SessionNotes } from "./session-notes";

const state = vi.hoisted(() => ({ active: "machine-a", contextSupported: true, transfer: vi.fn(), body: "Private full content", readers: [] as Array<{ method: string; enabled: boolean; read: (client: unknown) => Promise<unknown> }> }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: state.active, name: "Computer", capabilities: ["notes.sessionFilter.v1", ...(state.contextSupported ? ["sessions.noteContext.v1"] : [])] }) }));
vi.mock("./composer-transfer", () => ({ useComposerTransfer: () => ({ transfer: state.transfer }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/queries", () => ({ useHostQuery: (_key: unknown, method: string, _params: unknown, options: { enabled: boolean; queryFn: (client: unknown) => Promise<unknown> }) => {
  state.readers.push({ method, enabled: options.enabled, read: options.queryFn });
  const note = { id: "note-a", slug: "private-note", title: "Private note", body: state.body };
  return { isSuccess: true, isError: false, data: method === "notes.list" ? { notes: [note], total: 1 } : note };
} }));
vi.mock("@/ui/primitives", () => {
  const wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: wrap, Sheet: ({ children, footer }: PropsWithChildren<{ footer?: React.ReactNode }>) => createElement("div", null, children, footer), QueryState: () => null,
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
    ScreenList: ({ data, header, renderItem }: { data: unknown[]; header: React.ReactNode; renderItem: (row: { item: unknown }) => React.ReactNode }) => createElement("div", null, header, ...data.map((item) => renderItem({ item }))),
  };
});
vi.mock("../management/notes/note-summary-row", () => ({ NoteSummaryRow: ({ note, onPress }: { note: { id: string; title: string }; onPress: () => void }) => createElement("button", { key: note.id, onClick: onPress }, note.title) }));
vi.mock("@/ui/message-text", () => ({ MessageText: ({ text }: { text: string }) => createElement("div", null, text) }));
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const props = { scope: { machineId: "machine-a", sessionId: "session-a" }, projectId: "project-a", onClose: vi.fn() };
afterEach(async () => { await act(async () => root?.unmount()); state.active = "machine-a"; state.readers = []; state.contextSupported = true; state.body = "Private full content"; vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container);
  await act(async () => root.render(createElement(SessionNotes, props)));
}
it("pins list and selected note reads to the original session and project", async () => {
  await mount();
  const request = vi.fn(async () => ({ notes: [], total: 0 }));
  await state.readers.find((read) => read.method === "notes.list")!.read({ request });
  expect(request).toHaveBeenCalledWith("notes.list", { projectId: "project-a", sessionId: "session-a" }, { signal: undefined });
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toContain("Private full content");
  const selected = state.readers.filter((read) => read.method === "notes.get" && read.enabled).at(-1)!;
  request.mockResolvedValueOnce(null as never); await selected.read({ request });
  expect(request).toHaveBeenLastCalledWith("notes.get", { id: "note-a", projectId: "project-a", sessionId: "session-a" }, { signal: undefined });
});
it("hides cached selected content and disables reads when the computer changes", async () => {
  await mount(); await act(async () => container.querySelector("button")!.click());
  state.active = "machine-b"; state.readers = [];
  await act(async () => root.render(createElement(SessionNotes, props)));
  expect(container.textContent).not.toContain("Private full content");
  expect(container.textContent).toContain("Update bycoda");
  expect(state.readers.every((read) => !read.enabled)).toBe(true);
});
it("transfers only an explicitly selected full snapshot, once, without sending", async () => {
  await mount(); expect(state.transfer).not.toHaveBeenCalled();
  await act(async () => container.querySelector("button")!.click());
  expect(state.transfer).not.toHaveBeenCalled();
  const attach = [...container.querySelectorAll("button")].find((button) => button.textContent === "Add as context")!;
  await act(async () => { attach.click(); attach.click(); });
  expect(state.transfer).toHaveBeenCalledExactlyOnceWith({ machineId: "machine-a", sessionId: "session-a", text: "",
    noteCard: { id: "note-a", slug: "private-note", title: "Private note", body: "Private full content" } });
  expect(props.onClose).toHaveBeenCalledOnce();
});
it("does not expose attachment on an old host and never truncates an oversized note", async () => {
  state.contextSupported = false;
  await mount(); await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).not.toContain("Add as context");
  state.contextSupported = true; state.body = "x".repeat(64_001);
  await act(async () => root.render(createElement(SessionNotes, props)));
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Add as context")!.click());
  expect(state.transfer).not.toHaveBeenCalled(); expect(props.onClose).not.toHaveBeenCalled();
  expect(container.textContent).toContain("64,000");
});
