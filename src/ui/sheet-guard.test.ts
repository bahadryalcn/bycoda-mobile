// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SheetGuardContext, useSheetDismissal, useSheetGuard, useSheetGuards } from "./sheet-guard";
const fixture = vi.hoisted(() => ({ approve: undefined as undefined | (() => void) }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./confirm", () => ({ confirmAction: (_title: string, _detail: string, _label: string, action: () => void) => { fixture.approve = action; } }));
let dirty = false, pending = false, visible = true, childPending = false;
let controller: ReturnType<typeof useSheetDismissal>, editor: ReturnType<typeof useSheetGuard>;
let events: string[], root: ReturnType<typeof createRoot>, node: HTMLDivElement;
const close = () => events.push("close");
const navigate = () => events.push("navigate");
function Editor({ standalone = false }: { standalone?: boolean }) {
  editor = useSheetGuard({ dirty, pending: childPending, onClose: standalone ? close : undefined });
  return null;
}
function SheetHarness() {
  const guards = useSheetGuards();
  controller = useSheetDismissal({ visible, dirty: dirty || guards.dirty, pending: pending || guards.pending, onClose: close });
  return createElement(SheetGuardContext.Provider, { value: { register: guards.register, requestClose: controller.requestClose, requestCloseThen: controller.requestCloseThen } }, createElement(Editor));
}
const render = () => act(() => root.render(createElement(SheetHarness)));
beforeEach(() => {
  dirty = false; pending = false; childPending = false; visible = true; events = []; fixture.approve = undefined;
  node = document.createElement("div"); root = createRoot(node);
});
afterEach(() => { act(() => root.unmount()); vi.clearAllMocks(); });
it("closes a clean parent before running a continuation exactly once", () => {
  render(); act(() => { editor.requestCloseThen(navigate); editor.requestCloseThen(navigate); });
  expect(events).toEqual(["close", "navigate"]); expect(controller.confirming).toBe(false);
  visible = false; render(); visible = true; render(); act(() => editor.requestCloseThen(navigate));
  expect(events).toEqual(["close", "navigate", "close", "navigate"]);
});
it("keeps dirty state on cancel and never carries a canceled continuation into normal dismissal", () => {
  dirty = true; render(); act(() => editor.requestCloseThen(navigate)); expect(events).toEqual([]); expect(controller.confirming).toBe(true);
  const staleApproval = controller.confirmClose;
  act(() => controller.cancelClose()); act(() => staleApproval()); expect(events).toEqual([]);
  act(() => controller.requestClose()); act(() => controller.confirmClose()); expect(events).toEqual(["close"]);
});
it("runs only the approved request and refuses duplicate or replaced approval handlers", () => {
  dirty = true; render(); act(() => editor.requestCloseThen(navigate)); const old = controller.confirmClose;
  act(() => editor.requestCloseThen(() => events.push("replacement"))); act(() => old()); expect(events).toEqual([]);
  const accept = controller.confirmClose; act(() => accept()); act(() => accept()); expect(events).toEqual(["close", "replacement"]);
});
it("rechecks a pending operation while the confirmation is already open and requires another explicit approval", () => {
  dirty = true; render(); act(() => editor.requestCloseThen(navigate)); const accept = controller.confirmClose;
  pending = true; render(); act(() => accept()); expect(events).toEqual([]); expect(controller.confirming).toBe(true);
  pending = false; render(); expect(events).toEqual([]); act(() => controller.confirmClose()); expect(events).toEqual(["close", "navigate"]);
});
it("does not start closing while a parent or registered editor is pending", () => {
  pending = true; render(); act(() => editor.requestCloseThen(navigate)); expect(events).toEqual([]); expect(controller.confirming).toBe(false);
  pending = false; childPending = true; render(); act(() => editor.requestCloseThen(navigate)); expect(events).toEqual([]); expect(controller.confirming).toBe(false);
});
it("invalidates a continuation when hidden or unmounted", () => {
  dirty = true; render(); act(() => editor.requestCloseThen(navigate)); const old = controller.confirmClose;
  visible = false; render(); visible = true; render(); act(() => old()); expect(events).toEqual([]); expect(controller.confirming).toBe(false);
  act(() => editor.requestCloseThen(navigate)); const unmounted = controller.confirmClose;
  act(() => root.render(null)); act(() => unmounted()); expect(events).toEqual([]);
});
it("uses the same guarded order outside a Sheet and rejects stale native alert approval after pending or unmount", () => {
  dirty = true; act(() => root.render(createElement(Editor, { standalone: true })));
  act(() => editor.requestCloseThen(navigate)); expect(events).toEqual([]); const old = fixture.approve!;
  childPending = true; act(() => root.render(createElement(Editor, { standalone: true }))); act(() => old()); expect(events).toEqual([]);
  childPending = false; act(() => root.render(createElement(Editor, { standalone: true })));
  act(() => editor.requestCloseThen(navigate)); const accept = fixture.approve!; act(() => old()); expect(events).toEqual([]);
  act(() => accept()); act(() => accept()); expect(events).toEqual(["close", "navigate"]);
  act(() => editor.requestCloseThen(navigate)); const unmounted = fixture.approve!; act(() => root.render(null)); act(() => unmounted()); expect(events).toEqual(["close", "navigate"]);
});
