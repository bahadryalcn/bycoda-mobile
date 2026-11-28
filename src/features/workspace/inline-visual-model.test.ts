import { expect, it } from "vitest";
import {
  INLINE_VISUAL_MAX_FRAME,
  inlineVisualDocument,
  inlineVisualFrameHeight,
  inlineVisualPresentation,
  inlineVisualTheme,
} from "./inline-visual-model";

const id = "a".repeat(64);

it("draws a legacy snapshot from the block without a Host read", () => {
  const visual = { version: 1, title: "Revenue", html: "<svg></svg>", height: 240 };
  expect(inlineVisualPresentation(visual, [])).toEqual({ kind: "snapshot", title: "Revenue", html: "<svg></svg>", height: 240 });
});

it("reads a stored visual only from a computer that serves it", () => {
  const visual = { version: 2, id, title: "Chart", height: 300 };
  expect(inlineVisualPresentation(visual, ["sessions.inlineVisual"])).toEqual({ kind: "stored", id, title: "Chart", height: 300 });
  expect(inlineVisualPresentation(visual, ["sessions.block"])).toEqual({ kind: "unavailable", title: "Chart" });
  expect(inlineVisualPresentation(visual, undefined)).toEqual({ kind: "unavailable", title: "Chart" });
});

it("treats an invalid value as unavailable rather than drawing it", () => {
  expect(inlineVisualPresentation({ version: 2, id: "../x", title: "x", height: 300 }, ["sessions.inlineVisual"])).toEqual({ kind: "unavailable" });
  expect(inlineVisualPresentation({ version: 1, title: "x", html: "", height: 300 }, [])).toEqual({ kind: "unavailable" });
  expect(inlineVisualPresentation("<script>", [])).toEqual({ kind: "unavailable" });
});

it("bounds the inline frame", () => {
  expect(inlineVisualFrameHeight(200)).toBe(200);
  expect(inlineVisualFrameHeight(2000)).toBe(INLINE_VISUAL_MAX_FRAME);
  expect(inlineVisualFrameHeight(10)).toBe(80);
});

it("puts the theme sheet before the visual and drops its doctype", () => {
  const theme = inlineVisualTheme({
    panel: "#111", raised: "#222", fill: "#333", border: "#444", text: "#fff", muted: "#aaa",
    accent: "#0af", accentSolid: "#07e", primaryText: "#fff", success: "#0f0", warning: "#fa0", danger: "#f00", info: "#0af",
  });
  const document = inlineVisualDocument("<!doctype html><p>hi</p>", true, theme);
  expect(document.startsWith("<style>")).toBe(true);
  expect(document).toContain("--background:#111");
  expect(document).toContain("color-scheme:dark");
  expect(document).not.toMatch(/<!doctype/i);
  expect(document.endsWith("<p>hi</p>")).toBe(true);
});
