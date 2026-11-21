// @vitest-environment happy-dom
import { act, createElement as h, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectMenuSheet } from "./project-menu-sheet";

vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("@/ui/primitives", async () => {
  const { SheetGuardContext, useSheetDismissal } = await import("@/ui/sheet-guard");
  const register = () => {};
  return {
    Sheet: ({ children, visible, onClose }: { children: ReactNode; visible: boolean; onClose: () => void }) => {
      const { requestClose, requestCloseThen } = useSheetDismissal({ visible, dirty: false, pending: false, onClose });
      return visible ? h(SheetGuardContext.Provider, { value: { register, requestClose, requestCloseThen } }, children) : null;
    },
    NavigationGroup: ({ children }: { children: ReactNode }) => h("div", null, children),
    SectionHeader: ({ title }: { title: string }) => h("h2", null, title),
    NavigationRow: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) =>
      h("button", { disabled, onClick: onPress }, label),
  };
});

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("runs a project command once when taps arrive before the sheet closes", async () => {
  const onClose = vi.fn();
  const refresh = vi.fn();
  const details = vi.fn();
  const sections = [{ key: "project", title: "Project", items: [
    { key: "refresh", label: "Refresh", onPress: refresh },
    { key: "details", label: "Project details", onPress: details },
  ] }];
  const render = (visible: boolean) => act(async () => root.render(h(ProjectMenuSheet, { visible, sections, onClose })));
  await render(true);
  const [refreshButton, detailsButton] = container.querySelectorAll("button");
  await act(async () => { refreshButton!.click(); refreshButton!.click(); detailsButton!.click(); });
  expect(onClose).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledOnce();
  expect(details).not.toHaveBeenCalled();
  await render(false);
  await render(true);
  await act(async () => container.querySelectorAll("button")[1]!.click());
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(details).toHaveBeenCalledOnce();
});
