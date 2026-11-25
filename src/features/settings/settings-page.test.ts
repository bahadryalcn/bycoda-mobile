// @vitest-environment happy-dom
import { act, createElement, useContext, useLayoutEffect, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SheetGuardContext } from "@/ui/sheet-guard-context";
import { SettingsPage } from "./settings-page";

const navigation = vi.hoisted(() => ({
  repeat: vi.fn(),
  confirm: vi.fn(),
  onRemove: undefined as undefined | ((event: { repeat: () => void }) => void),
}));

vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: {} }));
vi.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (blocked: boolean, onRemove: typeof navigation.onRemove) => {
    navigation.onRemove = blocked ? onRemove : undefined;
  },
}));
vi.mock("@/ui/primitives", () => ({
  Screen: ({ children }: PropsWithChildren) => children,
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: navigation.confirm }));

function Editor({ pending }: { pending: boolean }) {
  const register = useContext(SheetGuardContext)?.register;
  useLayoutEffect(() => {
    register?.("editor", { dirty: true, pending });
    return () => register?.("editor", null);
  }, [register, pending]);
  return null;
}

it("keeps Back blocked until a dirty settings editor can confirm the removal", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  const render = (pending: boolean) =>
    act(() => root.render(createElement(SettingsPage, { title: "Agents" }, createElement(Editor, { pending }))));
  const event = { repeat: navigation.repeat };
  try {
    await render(false);
    navigation.onRemove?.(event);
    expect(navigation.confirm).toHaveBeenCalledOnce();
    expect(navigation.repeat).not.toHaveBeenCalled();
    const discard = navigation.confirm.mock.calls[0]![3] as () => void;

    await render(true);
    discard();
    navigation.onRemove?.(event);
    expect(navigation.confirm).toHaveBeenCalledOnce();
    expect(navigation.repeat).not.toHaveBeenCalled();

    await render(false);
    navigation.onRemove?.(event);
    await act(() => (navigation.confirm.mock.calls[1]![3] as () => void)());
    expect(navigation.repeat).toHaveBeenCalledOnce();
    expect(navigation.onRemove).toBeUndefined();
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
