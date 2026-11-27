// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", { "data-view": "" }, children),
}));
import { SwipeActions, SwipeActionsGroup } from "./swipe-actions";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

function render(onOpen: () => void, onDelete: () => void) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(createElement(SwipeActionsGroup, { fill: true },
    createElement(SwipeActions, { actions: [{ key: "delete", label: "Delete note", destructive: true, onPress: onDelete }] },
      createElement("button", { onClick: onOpen }, "Release checklist")))));
}

it("renders a row without a swipe rail, so its actions come only from the row's options menu", () => {
  const onDelete = vi.fn();
  render(vi.fn(), onDelete);
  expect(container!.textContent).toBe("Release checklist");
  expect(container!.textContent).not.toContain("Delete note");
  expect(onDelete).not.toHaveBeenCalled();
});

it("opens the record on a tap: there is no half-open row that a tap must close first", () => {
  const onOpen = vi.fn();
  render(onOpen, vi.fn());
  act(() => container!.querySelector("button")!.click());
  expect(onOpen).toHaveBeenCalledOnce();
});
