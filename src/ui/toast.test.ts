import { beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ show: vi.fn((_options: Record<string, unknown>) => "toast-1") }));
vi.mock("panelui-native/components/toast", () => ({ toast: { show: fixture.show }, ToastViewport: () => null }));
vi.mock("./toast-card", () => ({ ToastCard: () => null }));
import { showToast, TOAST_ACTION_DURATION_MS, TOAST_DURATION_MS } from "./toast";
import type { ReactElement } from "react";
import type { ToastCardProps } from "./toast-card";

function lastToast() {
  return fixture.show.mock.lastCall![0] as {
    duration: number;
    label: string;
    component: (handle: { hide: () => void }) => ReactElement<ToastCardProps>;
  };
}

beforeEach(() => fixture.show.mockClear());

it("shows a result for four seconds without an action", () => {
  showToast({ message: "Saved" });
  const options = lastToast();
  expect(options).toMatchObject({ label: "Saved", duration: TOAST_DURATION_MS });
  expect(options.component({ hide: vi.fn() }).props).toMatchObject({ message: "Saved", tone: "success" });
  expect(options.component({ hide: vi.fn() }).props.action).toBeUndefined();
  expect(TOAST_DURATION_MS).toBe(4000);
});

it("keeps an Undo or Retry toast for six seconds and closes it before running the action", () => {
  const onPress = vi.fn();
  showToast({ tone: "danger", message: "Couldn't pin", action: { label: "Retry", onPress } });
  const options = lastToast();
  expect(options.duration).toBe(TOAST_ACTION_DURATION_MS);
  const hide = vi.fn();
  const card = options.component({ hide }).props;
  expect(card).toMatchObject({ tone: "danger", action: { label: "Retry" } });
  card.action?.onPress();
  expect(hide).toHaveBeenCalledOnce();
  expect(onPress).toHaveBeenCalledOnce();
  expect(hide.mock.invocationCallOrder[0]).toBeLessThan(onPress.mock.invocationCallOrder[0]!);
});

it("keeps a caller duration", () => {
  showToast({ tone: "neutral", message: "Copied", duration: 1500, action: { label: "Undo", onPress: vi.fn() } });
  expect(lastToast().duration).toBe(1500);
});
