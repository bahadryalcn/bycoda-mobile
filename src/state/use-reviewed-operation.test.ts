// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useReviewedOperation } from "./use-reviewed-operation";

type Operation = ReturnType<typeof useReviewedOperation<string>>;
type Options = Parameters<typeof useReviewedOperation<string>>[0];
let latest: Operation;
let root: ReturnType<typeof createRoot> | undefined;

function Probe(options: Options) {
  latest = useReviewedOperation<string>(options);
  return null;
}
async function mount(options: Partial<Options> = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  await act(async () =>
    root!.render(
      createElement(Probe, { source: "store", load: async () => null, canRun: () => true, ...options }),
    ),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

it("reads the saved receipt once and reports ready", async () => {
  const load = vi.fn(async () => "saved");
  await mount({ load });
  expect(load).toHaveBeenCalledTimes(1);
  expect(latest).toMatchObject({ loaded: "saved", ready: true, loading: false, error: null });
});

it("surfaces a failed read without marking the receipt ready", async () => {
  const failure = new Error("unreadable");
  await mount({ load: async () => Promise.reject(failure) });
  expect(latest).toMatchObject({ loaded: null, ready: false, loading: false, error: failure });
});

it("lets a load report a problem while keeping the loaded receipt", async () => {
  const problem = new Error("mismatch");
  await mount({
    load: async ({ fail }) => {
      fail(problem);
      return "saved";
    },
  });
  expect(latest).toMatchObject({ loaded: "saved", ready: true, error: problem });
});

it("skips the read when disabled", async () => {
  const load = vi.fn(async () => "saved");
  await mount({ load, enabled: false });
  expect(load).not.toHaveBeenCalled();
  expect(latest).toMatchObject({ loaded: null, ready: false, loading: false });
});

it("runs one action at a time and tracks the pending key", async () => {
  await mount();
  let finish!: () => void;
  const first = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
  const second = vi.fn(async () => {});
  let running!: Promise<void>;
  await act(async () => {
    running = latest.run(first, "secondary-1");
    await latest.run(second);
  });
  expect(second).not.toHaveBeenCalled();
  expect(latest).toMatchObject({ busy: true, pendingAction: "secondary-1" });
  await act(async () => {
    finish();
    await running;
  });
  expect(latest.busy).toBe(false);
});

it("records a failed action, reports it and allows a retry", async () => {
  const onFailure = vi.fn();
  await mount({ onFailure });
  const failure = new Error("denied");
  await act(async () => latest.run(async () => Promise.reject(failure)));
  expect(latest).toMatchObject({ busy: false, error: failure });
  expect(onFailure).toHaveBeenCalledWith(failure);
  const retry = vi.fn(async () => {});
  await act(async () => latest.run(retry));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(latest.error).toBeNull();
});

it("ignores an action the owner does not allow", async () => {
  await mount({ canRun: () => false });
  const action = vi.fn(async () => {});
  await act(async () => latest.run(action));
  expect(action).not.toHaveBeenCalled();
  expect(latest.busy).toBe(false);
});
