// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SessionArtifacts } from "./session-artifacts";

const state = vi.hoisted(() => ({ machine: { id: "machine-a", capabilities: [] as string[] }, queries: [] as { method: string; enabled?: boolean }[] }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => state.machine }));
vi.mock("@/state/queries", () => ({ useHostQuery: (_key: unknown, method: string, _params: unknown, options: { enabled?: boolean }) => {
  state.queries.push({ method, enabled: options.enabled });
  return { data: undefined, isSuccess: false };
} }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/document-preview", () => ({ DocumentPreview: () => createElement("div", null, "preview") }));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children }: PropsWithChildren) => createElement("p", null, children),
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
  Sheet: ({ visible, children }: PropsWithChildren<{ visible: boolean }>) => visible ? createElement("section", null, children) : null,
  QueryState: () => null, ScreenList: () => null, NavigationRow: () => null,
}));
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); state.machine = { id: "machine-a", capabilities: [] }; state.queries = []; vi.unstubAllGlobals(); });

async function render(messageId?: string) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root ??= createRoot(container);
  await act(async () => root.render(createElement(SessionArtifacts, { projectId: "project-a", sessionId: "session-a", messageId })));
}

it("explains unsupported saved artifacts only after an explicit action without querying the host", async () => {
  root = createRoot(container);
  await render();
  expect(container.textContent).toBe("Saved artifacts");
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toContain("This computer does not support sharing saved HTML artifacts.");
  expect(container.textContent).toContain("from Files.");
  expect(state.queries.every((query) => query.enabled === false)).toBe(true);
});

it("keeps unsupported message rows empty and resets open state when the computer changes", async () => {
  root = createRoot(container);
  await render("message-a");
  expect(container.textContent).toBe("");
  await render();
  await act(async () => container.querySelector("button")!.click());
  state.machine = { id: "machine-b", capabilities: ["html.artifacts"] };
  state.queries = [];
  await render();
  expect(container.querySelector("section")).toBeNull();
  expect(state.queries.every((query) => query.enabled === false)).toBe(true);
  await act(async () => container.querySelector("button")!.click());
  expect(state.queries.at(-2)).toEqual({ method: "html.artifacts.list", enabled: true });
  expect(state.queries.at(-1)).toEqual({ method: "html.artifacts.read", enabled: false });
});
