// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PdfFrame } from "./pdf-frame.web";

let root: ReturnType<typeof createRoot>;
afterEach(() => { act(() => root?.unmount()); vi.unstubAllGlobals(); });
it("permits local password submission without same-origin access and filters messages by frame window", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), onMessage = vi.fn(); root = createRoot(host);
  document.body.append(host);
  act(() => root.render(createElement(PdfFrame, { html: "<p>PDF</p>", title: "Report", onMessage, onFailure: vi.fn() })));
  const frame = host.querySelector("iframe")!;
  expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-forms");
  expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
  window.dispatchEvent(new MessageEvent("message", { source: window, data: "other" }));
  expect(onMessage).not.toHaveBeenCalled();
  expect(frame.contentWindow).not.toBeNull();
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, data: "own" }));
  expect(onMessage).toHaveBeenCalledWith("own");
  host.remove();
});
