// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Block } from "@/domain/types";
import type { TranscriptBlockProps } from "./session-types";
import { SubagentDetails } from "./subagent-details";
const state = vi.hoisted(() => ({ activeId: "m", confirmation: undefined as undefined | (() => void), command: vi.fn(async (_command: unknown) => undefined) }));
vi.mock("@/state/machines", () => ({ useMachines: Object.assign((selector: (s: unknown) => unknown) => selector({ machines: [{ id: "m", capabilities: ["sessions.stopItem.claude"] }] }), { getState: () => ({ activeId: state.activeId }) }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: { xs: 4 } }));
vi.mock("../management/shared/format", () => ({ stamp: (value: unknown) => String(value) }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, _text: string, _label: string, callback: () => void) => { state.confirmation = callback; } }));
vi.mock("./shared", () => ({ ErrorText: ({ error }: { error: unknown }) => createElement("p", null, error ? String(error) : "") }));
vi.mock("./transcript-tool-preview", () => ({ TranscriptToolPreview: () => null }));
vi.mock("@/ui/message-text", () => ({ MessageText: ({ text }: { text: string }) => createElement("p", null, text) }));
vi.mock("@/ui/primitives", () => {
  const content = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Stack: content, Row: content, Body: content,
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    Button: ({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled: boolean; busy: boolean }) => createElement("button", { disabled: disabled || busy, onClick: onPress }, label) };
});
vi.mock("@/ui/screen-list", () => ({ ScreenList: ({ header, footer }: { header: ReactNode; footer: ReactNode }) => createElement("div", null, header, footer) }));
const block = { id: "b", role: "tool", text: "Review", tool: { callId: "call", status: "running" }, agentRun: { name: "Reviewer", steps: [] } } as Block;
let root: ReturnType<typeof createRoot>;
const container = document.createElement("div");
async function mount(parentProvider: "claude" | "codex" = "claude") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () => root.render(createElement(SubagentDetails, { block, scope: { machineId: "m", sessionId: "parent" }, runId: "run", parentProvider, disabled: false,
    onCommand: state.command as unknown as TranscriptBlockProps["onCommand"] })));
}
afterEach(async () => { await act(async () => root?.unmount()); vi.clearAllMocks(); vi.unstubAllGlobals(); state.activeId = "m"; state.confirmation = undefined; });
it("opening details is read only; explicit confirmation targets the exact child call", async () => {
  await mount();
  expect(state.command).not.toHaveBeenCalled();
  await act(async () => container.querySelector("button")!.click());
  expect(state.command).not.toHaveBeenCalled();
  await act(async () => state.confirmation!());
  expect(state.command).toHaveBeenCalledExactlyOnceWith({ type: "stopItem", sessionId: "parent", runId: "run", blockId: "b", callId: "call" });
  expect(container.textContent).toContain("stop request was accepted");
});
it("never retargets after a machine change and never replays an uncertain write", async () => {
  state.command.mockRejectedValueOnce(new Error("Network result unknown"));
  await mount();
  await act(async () => container.querySelector("button")!.click());
  state.activeId = "other";
  await act(async () => state.confirmation!());
  expect(state.command).not.toHaveBeenCalled();
  state.activeId = "m";
  await act(async () => state.confirmation!());
  expect(state.command).toHaveBeenCalledTimes(1);
  expect(container.querySelector("button")!.disabled).toBe(true);
  await act(async () => state.confirmation!());
  expect(state.command).toHaveBeenCalledTimes(1);
});
it("does not offer per-item stop for a provider without the real hook", async () => {
  await mount("codex");
  expect(container.querySelector("button")).toBeNull();
  expect(state.command).not.toHaveBeenCalled();
});
