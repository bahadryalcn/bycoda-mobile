// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const clip = vi.hoisted(() => ({ calls: [] as string[], pending: [] as { resolve: () => void; reject: (error: unknown) => void }[] }));
vi.mock("expo-clipboard", () => ({
  setStringAsync: (text: string) => new Promise<void>((resolve, reject) => { clip.calls.push(text); clip.pending.push({ resolve, reject }); }),
}));
import { useClipboardFeedback } from "./use-clipboard-feedback";

function Probe({ payload }: { payload: string }) {
  const feedback = useClipboardFeedback(payload);
  return createElement("div", null, createElement("button", { onClick: feedback.copy }, "copy"),
    createElement("p", { id: "state" }, `${feedback.copied ? "copied" : "idle"}|${feedback.busy ? "busy" : "free"}|${feedback.error?.message ?? ""}`));
}
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
async function render(payload: string) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); }
  await act(async () => root!.render(createElement(Probe, { payload })));
}
const state = () => container.querySelector("#state")!.textContent;
const press = () => container.querySelector("button")!.click();
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container?.remove(); clip.calls = []; clip.pending = []; vi.unstubAllGlobals(); });

it("repeated presses before a render start at most one in-flight copy of the exact payload", async () => {
  const payload = "line one\n\t  trailing  \n🙂";
  await render(payload);
  await act(async () => { press(); press(); press(); });
  expect(clip.calls).toEqual([payload]); expect(state()).toBe("idle|busy|");
  await act(async () => clip.pending[0]!.resolve());
  expect(state()).toBe("copied|free|");
});
it("a delayed failure for an old payload cannot show an obsolete error on the new payload", async () => {
  await render("old");
  await act(async () => press());
  await render("old and streamed more");
  await act(async () => clip.pending[0]!.reject(new Error("clipboard unavailable")));
  expect(state()).toBe("idle|free|");
});
it("a delayed success for an old payload cannot mark the new payload copied", async () => {
  await render("old");
  await act(async () => press());
  await render("new");
  await act(async () => clip.pending[0]!.resolve());
  expect(state()).toBe("idle|free|");
});
it("shows a failure for the current payload and retry clears it and can succeed", async () => {
  await render("payload");
  await act(async () => press());
  await act(async () => clip.pending[0]!.reject(new Error("denied")));
  expect(state()).toBe("idle|free|denied");
  await act(async () => press());
  expect(state()).toBe("idle|busy|"); expect(clip.calls).toEqual(["payload", "payload"]);
  await act(async () => clip.pending[1]!.resolve());
  expect(state()).toBe("copied|free|");
});
