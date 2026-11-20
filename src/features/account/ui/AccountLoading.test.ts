// @vitest-environment happy-dom
import { act, createElement as h, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

type StateAction = { label: string; onPress: () => void };
const shown = vi.hoisted(() => ({ loading: 0, state: null as null | { title: string; action?: StateAction } }));
vi.mock("react-native", () => ({ View: "div" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({
  Screen: ({ children }: { children?: ReactNode }) => children,
  Loading: () => { shown.loading += 1; return null; },
  StateView: (props: { title: string; action?: StateAction }) => { shown.state = props; return null; },
}));
import { AccountLoading } from "./AccountLoading";
import { ACCOUNT_LOAD_DEADLINE_MS } from "./use-account-load-deadline";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  shown.loading = 0;
  shown.state = null;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("turns an endless account spinner into a bounded wait with Retry that restarts the wait", async () => {
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(h(AccountLoading)));
    expect(shown.loading).toBeGreaterThan(0);
    expect(shown.state).toBeNull();

    await act(async () => { vi.advanceTimersByTime(ACCOUNT_LOAD_DEADLINE_MS - 1); });
    expect(shown.state).toBeNull();

    await act(async () => { vi.advanceTimersByTime(1); });
    expect(shown.state?.title).toBe("The account connection is slow");
    const retry = shown.state?.action;
    expect(retry?.label).toBe("Retry");

    shown.state = null;
    await act(async () => retry?.onPress());
    expect(shown.state).toBeNull();
    await act(async () => { vi.advanceTimersByTime(ACCOUNT_LOAD_DEADLINE_MS); });
    // The render above sets it again; TypeScript still narrows the earlier `= null` assignment.
    expect((shown.state as typeof shown.state | { title: string })?.title).toBe("The account connection is slow");
  } finally {
    await act(async () => root.unmount());
  }
});

it("stops waiting once the account gate leaves the loading state", async () => {
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(h(AccountLoading)));
  await act(async () => root.unmount());
  shown.state = null;
  await act(async () => { vi.advanceTimersByTime(ACCOUNT_LOAD_DEADLINE_MS * 2); });
  expect(shown.state).toBeNull();
});
