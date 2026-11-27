// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/fields", () => ({
  ToggleField: ({
    label,
    value,
    detail,
    disabled,
    onChange,
  }: {
    label: string;
    value: boolean;
    detail?: string;
    disabled?: boolean;
    onChange: (value: boolean) => void;
  }) =>
    createElement(
      "button",
      { disabled, "aria-pressed": value, onClick: () => onChange(!value) },
      label,
      detail,
    ),
}));
vi.mock("@/ui/primitives", () => ({
  SegmentedRow: () => null,
  Notice: ({
    message,
    onRetry,
    retrying,
  }: {
    message: string;
    onRetry: () => void;
    retrying?: boolean;
  }) =>
    createElement(
      "p",
      null,
      message,
      createElement("button", { onClick: onRetry, disabled: retrying }, "Retry"),
    ),
}));
import { WidgetSettings } from "./WidgetSettings";
import { useWidgetPreferences } from "./model/widget-preferences";

let root: ReturnType<typeof createRoot> | undefined, node: HTMLDivElement;
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(createElement(WidgetSettings)));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  node?.remove();
  useWidgetPreferences.setState({
    showTitles: false,
    hydrated: false,
    pending: null,
    storageError: null,
  });
  storage.getItem.mockReset();
  storage.setItem.mockReset();
  vi.unstubAllGlobals();
});
it("distinguishes unread failure and unsaved choice, with operation-specific retry", async () => {
  storage.getItem.mockRejectedValue(new Error("Storage offline"));
  await mount();
  expect(node.querySelector("button")?.disabled).toBe(true);
  expect(node.textContent).toContain("Unavailable");
  expect(node.textContent).not.toContain("Loading…");
  storage.getItem.mockResolvedValue(null);
  await act(async () =>
    [...node.querySelectorAll("button")].find((button) => button.textContent === "Retry")!.click(),
  );
  expect(node.querySelector("button")?.disabled).toBe(false);
  storage.setItem.mockRejectedValue(new Error("Storage full"));
  await act(async () => node.querySelector("button")!.click());
  expect(node.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
  expect(node.textContent).toContain("Not saved");
  expect(node.textContent).toContain("Your choice is kept for this session");
  storage.setItem.mockResolvedValue(undefined);
  await act(async () =>
    [...node.querySelectorAll("button")].find((button) => button.textContent === "Retry")!.click(),
  );
  expect(node.textContent).not.toContain("Not saved");
  expect(node.textContent).not.toContain("Retry");
  expect(node.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
});
it("keeps the editor disabled while the saved privacy choice is loading", async () => {
  let finish!: (raw: string | null) => void;
  storage.getItem.mockReturnValue(
    new Promise<string | null>((resolve) => {
      finish = resolve;
    }),
  );
  await mount();
  expect(node.textContent).toContain("Loading…");
  expect(node.querySelector("button")?.disabled).toBe(true);
  await act(async () => finish('{"showTitles":true}'));
  expect(node.querySelector("button")?.disabled).toBe(false);
  expect(node.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
});
