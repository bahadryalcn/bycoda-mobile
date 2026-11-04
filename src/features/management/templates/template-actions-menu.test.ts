// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TemplateActionsMenu } from "./template-actions-menu";

const fixture = vi.hoisted(() => ({
  current: true, onPress: null as null | (() => void),
  confirmations: [] as Array<{ title: string; detail: string; confirm: () => void }>,
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (title: string, detail: string, _label: string, confirm: () => void) => fixture.confirmations.push({ title, detail, confirm }) }));
vi.mock("@/ui/primitives", () => ({ ActionMenu: ({ actions }: { actions: Array<{ label: string; disabled: boolean; destructive: boolean; onPress: () => void }> }) => {
  const action = actions[0]; fixture.onPress = action.onPress;
  return createElement("button", { disabled: action.disabled, "data-destructive": action.destructive, onClick: action.onPress }, action.label);
} }));
let root: ReturnType<typeof createRoot>;
let props: ComponentProps<typeof TemplateActionsMenu>;
const container = document.createElement("div"), remove = vi.fn();
async function render() { await act(async () => root.render(createElement(TemplateActionsMenu, props))); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); document.body.append(container); root = createRoot(container);
  fixture.current = true; props = { templateId: "one", name: "Reviewed template", revision: "r1", disabled: false, onDelete: remove, isCurrent: () => fixture.current };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); fixture.confirmations = []; fixture.onPress = null; vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("requires confirmation of the displayed template before deleting", async () => {
  await render(); fixture.onPress!();
  expect(container.querySelector("button")?.dataset.destructive).toBe("true");
  expect(fixture.confirmations[0]).toMatchObject({ title: "Delete template", detail: "Reviewed template" });
  expect(remove).not.toHaveBeenCalled(); fixture.confirmations[0].confirm(); expect(remove).toHaveBeenCalledOnce();
});

it.each(["disabled", "busy", "target", "revision", "name", "unmount", "away-and-back"])("retires a pending confirmation after %s changes", async (change) => {
  await render(); const retained = fixture.onPress!; retained(); const confirm = fixture.confirmations[0].confirm;
  if (change === "disabled") props = { ...props, disabled: true };
  if (change === "busy") props = { ...props, busy: true };
  if (change === "target") props = { ...props, templateId: "two" };
  if (change === "revision") props = { ...props, revision: "r2" };
  if (change === "name") props = { ...props, name: "Another name" };
  if (change === "unmount") await act(async () => root.render(null));
  else if (change === "away-and-back") { props = { ...props, disabled: true }; await render(); props = { ...props, disabled: false }; await render(); }
  else await render();
  confirm(); retained(); expect(remove).not.toHaveBeenCalled(); expect(fixture.confirmations).toHaveLength(1);
});

it("checks live scope again at confirmation while keeping an unchanged review usable through polling", async () => {
  await render(); fixture.onPress!(); const confirm = fixture.confirmations[0].confirm;
  props = { ...props, isCurrent: () => fixture.current }; await render();
  fixture.current = false; confirm(); expect(remove).not.toHaveBeenCalled();
  fixture.current = true; confirm(); expect(remove).toHaveBeenCalledOnce();
});

it("does not open a confirmation for a disabled or unavailable request", async () => {
  props = { ...props, disabled: true }; await render(); fixture.onPress!();
  props = { ...props, disabled: false }; fixture.current = false; await render(); fixture.onPress!();
  expect(fixture.confirmations).toHaveLength(0); expect(remove).not.toHaveBeenCalled();
});
