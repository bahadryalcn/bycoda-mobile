// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  allowed: true, unlocked: true, routeFocused: true,
  query: vi.fn<() => Promise<boolean>>(), focus: vi.fn(),
  access: { allowed: true, check: (): boolean => state.allowed },
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: { isScreenReaderEnabled: state.query, setAccessibilityFocus: state.focus },
  findNodeHandle: (node: { tag: number } | null) => node?.tag ?? null,
}));
vi.mock("@/state/security", () => ({ useSecurity: { getState: () => ({ status: state.unlocked ? "unlocked" : "locked" }) } }));
vi.mock("./use-route-focus", () => ({ useRouteFocus: () => state.routeFocused }));
vi.mock("./private-content", () => ({ usePrivateContentAccess: () => state.access }));
import { useNativeSheetFocus } from "./use-native-sheet-focus";

let root: Root;
let frames: FrameRequestCallback[];
const heading = { current: { tag: 11 } } as any;
const trigger = { current: { tag: 22 } } as any;
function Harness({ visible }: { visible: boolean }) {
  useNativeSheetFocus(visible, heading, trigger);
  return createElement("input", { defaultValue: "Retained draft" });
}
async function render(visible: boolean) { await act(async () => root.render(createElement(Harness, { visible }))); }
function flush() { const pending = frames.splice(0); for (const callback of pending) callback(0); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("EXPO_OS", "android");
  state.allowed = true; state.unlocked = true; state.routeFocused = true; state.focus.mockReset(); state.query.mockReset().mockResolvedValue(true);
  frames = []; vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("leaves ordinary native focus alone when the screen reader is disabled", async () => {
  state.query.mockResolvedValue(false); await render(true); await render(false); flush();
  expect(state.focus).not.toHaveBeenCalled();
});
it("focuses the heading and restores its trigger for an enabled reader", async () => {
  await render(true); flush(); expect(state.focus.mock.calls).toEqual([[11]]);
  await render(false); flush(); expect(state.focus.mock.calls).toEqual([[11], [22]]);
});
it("ignores a screen-reader query resolving after its Sheet has closed", async () => {
  let resolve!: (enabled: boolean) => void;
  state.query.mockReturnValue(new Promise<boolean>(done => { resolve = done; }));
  await render(true); await render(false); await act(async () => resolve(true)); flush();
  expect(state.focus).not.toHaveBeenCalled();
});
it("rejects initial focus after private workspace access is revoked", async () => {
  await render(true); state.allowed = false; flush(); expect(state.focus).not.toHaveBeenCalled();
});
it("does not return focus to a concealed workspace", async () => {
  await render(true); flush(); state.focus.mockClear(); state.allowed = false;
  await render(false); flush(); expect(state.focus).not.toHaveBeenCalled();
});
it("does not move focus across the lock boundary", async () => {
  await render(true); state.unlocked = false; flush(); await render(false); flush();
  expect(state.focus).not.toHaveBeenCalled();
});
it("cancels an older return frame when the same Sheet reopens", async () => {
  await render(true); flush(); state.focus.mockClear();
  await render(false); await render(true); flush();
  expect(state.focus.mock.calls).toEqual([[11]]);
});
it("leaves the existing web overlay focus controller in charge", async () => {
  vi.stubEnv("EXPO_OS", "web"); await render(true); await render(false); flush();
  expect(state.query).not.toHaveBeenCalled(); expect(state.focus).not.toHaveBeenCalled();
});
it("keeps the editor usable if the native accessibility query rejects", async () => {
  state.query.mockRejectedValue(new Error("Service unavailable"));
  await render(true); await render(false); flush(); expect(state.focus).not.toHaveBeenCalled();
});

it("does not focus a hidden route heading after navigation while reader detection was pending", async () => {
  let resolve!: (enabled: boolean) => void; state.query.mockReturnValue(new Promise(done => { resolve = done; }));
  await render(true); state.routeFocused = false; await render(true);
  await act(async () => resolve(true)); flush(); expect(state.focus).not.toHaveBeenCalled();
});
it("blur never restores the previous route trigger and refocus restores only the retained sheet heading", async () => {
  await render(true); flush(); state.focus.mockClear();
  state.routeFocused = false; await render(true); flush(); expect(state.focus).not.toHaveBeenCalled();
  state.routeFocused = true; await render(true); flush(); expect(state.focus.mock.calls).toEqual([[11]]);
});
