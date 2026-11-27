import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

// Regression for #431: the non-scrolling Screen frame skipped the home-indicator inset and the
// landscape notch gutter, and its callers re-implemented (or forgot) them.
const fixture = vi.hoisted(() => ({ insets: { top: 0, left: 0, right: 0, bottom: 0 } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => fixture.insets }));
vi.mock("./tokens", async () => {
  const actual = await vi.importActual<typeof import("./tokens")>("./tokens");
  return { ...actual, space: { ...actual.space, screen: 16 } };
});
import { ScreenChrome } from "./screen-chrome";
import { ScreenFrameInsets, useScreenContentInsets } from "./screen-content-insets";

function probe(bottomSafeArea = true, frame?: boolean, nested?: boolean) {
  let seen = { left: -1, right: -1, bottom: -1 };
  function Probe() { seen = useScreenContentInsets(); return null; }
  let tree: ReactNode = createElement(Probe);
  if (nested) tree = createElement(ScreenFrameInsets, { value: false }, tree);
  if (frame !== undefined) tree = createElement(ScreenFrameInsets, { value: frame }, tree);
  renderToStaticMarkup(createElement(ScreenChrome.Provider, { value: { nativeTitle: false, bottomSafeArea, bottomInset: 80 } }, tree));
  return seen;
}

it("lets a landscape cutout win over the flat gutter and adds dock plus home indicator outside a frame", () => {
  fixture.insets = { top: 0, left: 44, right: 0, bottom: 34 };
  expect(probe()).toEqual({ left: 44, right: 16, bottom: 114 });
  expect(probe(false).bottom).toBe(80);
});

it("reserves the bottom inset once: a Screen frame owns it, a Sheet inside the frame does not", () => {
  fixture.insets = { top: 0, left: 0, right: 44, bottom: 34 };
  expect(probe(true, true)).toEqual({ left: 16, right: 44, bottom: 0 });
  expect(probe(true, true, true).bottom).toBe(114);
});

const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

it("pads the home indicator in the non-scrolling frame and marks it owned, without doubling it in the footer", () => {
  expect(layout).toContain("paddingBottom: chrome.bottomInset + (frameBottomSafe ? insets.bottom : 0)");
  expect(layout).toMatch(/<ScreenFrameInsets value>[\s\S]*<ScreenHeader onLayout=\{measureHeader\}>[\s\S]*\{actionArea\}[\s\S]*<\/ScreenFrameInsets>/);
  expect(layout).toContain("(scroll || contentOwnsBottomInset) ? insets.bottom : 0");
  expect(layout).toContain("paddingLeft: content.left, paddingRight: content.right");
});

it("keeps callers that reserve the home indicator themselves from doubling it", () => {
  expect(read("features/workspace/session-screen.tsx")).toContain("<Screen scroll={false} contentOwnsBottomInset>");
  expect(read("features/workspace/sessions-panel.tsx")).toContain("paddingBottom: insets.bottom");
  expect(read("ui/screen-list.tsx")).toContain("paddingBottom: space.lg + content.bottom");
});

it("keeps the legal reader and its section toolbar inside the frame that owns the bottom inset", () => {
  expect(read("features/legal/legal-screen.tsx")).toMatch(/<Screen scroll=\{false\}>[\s\S]*?<LegalReader/);
  expect(read("features/legal/legal-reader.tsx")).not.toContain("content.bottom");
  expect(read("ui/section-progress.tsx")).toContain("const insets = useScreenContentInsets()");
});

it("gives the raw ScrollView and FlatList call sites in non-scrolling screens landscape gutters", () => {
  const project = read("features/workspace/project-screen.tsx");
  expect(project).not.toContain("padding: space.screen");
  expect(project.match(/paddingLeft: gutter\.left, paddingRight: gutter\.right/g)).toHaveLength(2);
  expect(read("features/workspace/projects-screen.tsx")).toContain("paddingLeft: gutter.left");
});
