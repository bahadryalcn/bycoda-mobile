// @vitest-environment happy-dom
import { act, createElement, forwardRef, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "web" },
  View: forwardRef<HTMLDivElement, PropsWithChildren>(function View({ children }, ref) {
    return createElement("div", { ref }, children);
  }),
}));
vi.mock("panelui-native/components/swipe", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Swipe: Object.assign(wrapper, { End: wrapper, Action: () => null, Group: wrapper }) };
});
vi.mock("./theme", () => ({ useMobileTheme: () => undefined }));
vi.mock("./private-access", () => ({
  usePrivateContentAccess: () => ({ allowed: true, check: () => true }),
}));
vi.mock("./tokens", () => ({ colors: {}, metrics: {}, opacity: {}, semanticColors: {} }));
import { SwipeActions } from "./swipe-actions";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

function renderRow() {
  const navigate = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      createElement(
        SwipeActions,
        { actions: [] },
        createElement("button", { onClick: navigate }, "Open session"),
      ),
    ),
  );
  const button = container.querySelector("button")!;
  const pointer = (type: string, x: number, y: number) =>
    button.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y }));
  const click = (detail = 1) =>
    button.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        detail,
      }),
    );
  return { navigate, pointer, click };
}

it("revealing swipe actions cannot also open the conversation; a later tap can", () => {
  const row = renderRow();
  row.pointer("pointerdown", 300, 40);
  row.pointer("pointermove", 30, 40);
  row.pointer("pointerup", 30, 40);
  row.click();
  expect(row.navigate).not.toHaveBeenCalled();
  row.pointer("pointerdown", 200, 40);
  row.pointer("pointerup", 200, 40);
  row.click();
  expect(row.navigate).toHaveBeenCalledTimes(1);
});

it("preserves keyboard activation after a drag without a synthesized click", () => {
  const row = renderRow();
  row.pointer("pointerdown", 300, 40);
  row.pointer("pointermove", 30, 40);
  row.click(0);
  expect(row.navigate).toHaveBeenCalledTimes(1);
});

it("scrolling vertically does not open the conversation", () => {
  const row = renderRow();
  row.pointer("pointerdown", 200, 40);
  row.pointer("pointermove", 200, 120);
  row.click();
  expect(row.navigate).not.toHaveBeenCalled();
});
