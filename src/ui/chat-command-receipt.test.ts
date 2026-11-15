// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: { muted: "muted" }, uiStyles: { caption: {} } }) }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
import { ChatCommandReceipt } from "./chat-command-receipt";

let root: Root | undefined;
let container: HTMLDivElement;
async function render(onExpire?: () => void) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) {
    container = document.createElement("div");
    root = createRoot(container);
  }
  await act(async () => root!.render(createElement(ChatCommandReceipt, { onExpire })));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("expires once despite streaming callback churn and uses the current callback", async () => {
  vi.useFakeTimers();
  const old = vi.fn();
  const current = vi.fn();
  await render(old);
  expect(container.textContent).toContain("The computer accepted the command.");
  await act(async () => vi.advanceTimersByTime(2000));
  await render(current);
  await act(async () => vi.advanceTimersByTime(500));
  expect(container.textContent).toBe("");
  expect(old).not.toHaveBeenCalled();
  expect(current).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTime(3000));
  expect(current).toHaveBeenCalledOnce();
});

it("also hides without an owner callback and cancels expiry on unmount", async () => {
  vi.useFakeTimers();
  await render();
  await act(async () => vi.advanceTimersByTime(2500));
  expect(container.textContent).toBe("");
  await act(async () => root!.unmount());
  root = undefined;
  const expire = vi.fn();
  await render(expire);
  await act(async () => root!.unmount());
  root = undefined;
  await act(async () => vi.advanceTimersByTime(2500));
  expect(expire).not.toHaveBeenCalled();
});
