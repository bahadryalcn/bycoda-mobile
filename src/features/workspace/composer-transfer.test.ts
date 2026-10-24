// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ComposerTransferProvider, useComposerTransfer } from "./composer-transfer";
const scope = { machineId: "machine", sessionId: "session" };
let bridge: NonNullable<ReturnType<typeof useComposerTransfer>>;
const receive = vi.fn();
function Owner({ mounted }: { mounted: boolean }) {
  const value = useComposerTransfer()!; bridge = value;
  useEffect(() => mounted ? value.register(receive) : undefined, [value, mounted]);
  return null;
}
let root: ReturnType<typeof createRoot> | undefined;
async function render(mounted: boolean) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root ??= createRoot(document.createElement("div"));
  await act(async () => root!.render(createElement(ComposerTransferProvider, { scope }, createElement(Owner, { mounted }))));
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; receive.mockReset(); vi.unstubAllGlobals(); });
it("uses only the registered composer owner and refuses missing/stale destination receivers", async () => {
  await render(false);
  expect(() => bridge.transfer({ ...scope, text: "quote" })).toThrow("unavailable");
  await render(true);
  expect(() => bridge.transfer({ ...scope, machineId: "other", text: "quote" })).toThrow("unavailable");
  expect(() => bridge.transfer({ ...scope, sessionId: "other", text: "quote" })).toThrow("unavailable");
  bridge.transfer({ ...scope, text: "quote" });
  expect(receive).toHaveBeenCalledExactlyOnceWith({ ...scope, text: "quote" });
  await render(false);
  expect(() => bridge.transfer({ ...scope, text: "quote" })).toThrow("unavailable");
});
