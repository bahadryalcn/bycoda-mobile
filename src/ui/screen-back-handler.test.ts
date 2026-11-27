// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const back = vi.hoisted(() => ({ listeners: [] as (() => boolean)[] }));
vi.mock("react-native", () => ({
  BackHandler: {
    addEventListener: (_event: string, listener: () => boolean) => {
      back.listeners.push(listener);
      return { remove: () => { back.listeners = back.listeners.filter((entry) => entry !== listener); } };
    },
  },
}));

import { OverlayLayerDepth, handleOverlayBack, setOverlayBackOwner } from "./overlay-back";
import { useScreenBackHandler } from "./screen-back-handler";

/** Android runs the most recently subscribed listener first, until one consumes the press. */
const pressBack = () => { for (const listener of [...back.listeners].reverse()) if (listener()) return; };

afterEach(() => { setOverlayBackOwner(null); back.listeners = []; vi.unstubAllGlobals(); });

it("closes the open sheet before the page's own Back step, whatever subscribed last", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const page = vi.fn();
  const closeSheet = vi.fn();
  function Page() { useScreenBackHandler(true, page); return null; }
  const root = createRoot(document.createElement("div"));
  try {
    setOverlayBackOwner(closeSheet);
    // The page handler subscribes after the sheet opened, so it is asked first.
    await act(async () => root.render(h(Page)));
    pressBack();
    expect(closeSheet).toHaveBeenCalledOnce();
    expect(page).not.toHaveBeenCalled();
    setOverlayBackOwner(null);
    pressBack();
    expect(page).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); }
});

it("keeps Back for a handler that lives inside the sheet itself", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const inner = vi.fn();
  const closeSheet = vi.fn();
  function Inner() { useScreenBackHandler(true, inner); return null; }
  const root = createRoot(document.createElement("div"));
  try {
    setOverlayBackOwner(closeSheet);
    await act(async () => root.render(h(OverlayLayerDepth.Provider, { value: 30 }, h(Inner))));
    pressBack();
    expect(inner).toHaveBeenCalledOnce();
    expect(closeSheet).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});

it("reports whether an overlay handled Back", () => {
  expect(handleOverlayBack()).toBe(false);
  const close = vi.fn();
  setOverlayBackOwner(close);
  expect(handleOverlayBack()).toBe(true);
  expect(close).toHaveBeenCalledOnce();
});
