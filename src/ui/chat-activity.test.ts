import { describe, expect, it, vi } from "vitest";
import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const fixture = vi.hoisted(() => ({ active: true, reduced: false }));
vi.mock("@/state/queries", () => ({ useHostReadActive: () => fixture.active }));
vi.mock("./use-reduced-motion", () => ({ useReducedMotionPreference: () => fixture.reduced }));
vi.mock("./theme", () => ({ useMobileTheme: vi.fn(() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} })) }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./styles", () => ({
  uiStyles: { label: { fontSize: 17, lineHeight: 22 }, caption: { fontSize: 13, lineHeight: 18 } },
}));
vi.mock("./tokens", () => ({
  colors: { text: "ink", danger: "danger", muted: "muted", tertiary: "tertiary", warning: "warning" },
  space: {},
  metrics: { touchTarget: 48, toolRowHeight: 28 },
  radii: {},
  fontSize: { control: 14, caption: 12 },
  lineHeight: { control: 19, caption: 16 },
  gapIcon: 8,
  hitSlopFor: () => ({}),
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Pressable: ({
    children,
    accessibilityLabel,
    accessibilityState,
    style,
  }: PropsWithChildren<{
    accessibilityLabel: string;
    accessibilityState?: { expanded?: boolean };
    style?: (state: { pressed: boolean }) => object;
  }>) =>
    createElement(
      "button",
      { "aria-label": accessibilityLabel, "aria-expanded": accessibilityState?.expanded, "data-layout": JSON.stringify(style?.({ pressed: false })) },
      children,
    ),
}));
vi.mock("./typography", () => ({
  Body: ({ children, style, numberOfLines, mono }: PropsWithChildren<{ style?: object; numberOfLines?: number; mono?: boolean }>) =>
    createElement("span", { "data-text-style": JSON.stringify(style), "data-lines": numberOfLines, "data-mono": mono }, children),
}));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/sparkles", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/terminal", () => ({ default: () => null }));
vi.mock("panelui-native/components/task", () => {
  const Task = Object.assign(
    ({ status, children }: PropsWithChildren<{ status: string }>) =>
      createElement("section", { "data-status": status }, children),
    {
      Trigger: ({
        children,
        accessibilityLabel,
        "aria-expanded": expanded,
      }: PropsWithChildren<{ accessibilityLabel?: string; "aria-expanded"?: boolean }>) =>
        createElement(
          "button",
          { "aria-label": accessibilityLabel, "aria-expanded": expanded },
          children,
        ),
      Content: ({ children }: PropsWithChildren) => createElement("div", null, children),
    },
  );
  return { Task };
});
vi.mock("panelui-native/components/reasoning", () => ({ Reasoning: "div" }));
vi.mock("panelui-native/components/plan", () => ({ Plan: "div" }));
vi.mock("panelui-native/components/shimmer", () => ({
  Shimmer: ({
    enabled,
    children,
    textStyle,
  }: PropsWithChildren<{ enabled: boolean; textStyle?: object }>) =>
    createElement(
      "span",
      { "data-animating": String(enabled), "data-text-style": JSON.stringify(textStyle) },
      children,
    ),
}));
import { ChatActivity, ChatStreaming } from "./chat-activity";

describe("chat continuous animation lifecycle", () => {
  it("keeps literal commands on one monospace line beside a short status and full inspector name", () => {
    fixture.reduced = true;
    const command = "echo **literal** && pnpm test --filter workspace";
    const html = renderToStaticMarkup(createElement(ChatActivity, {
      title: command, detail: "Full output", status: "running", onInspect: vi.fn(),
    }));
    expect(html).toContain('data-lines="1" data-mono="true"');
    expect(html).toContain(">Working<");
    expect(html).toContain("echo **literal** &amp;&amp; pnpm test --filter workspace");
    expect(html).toContain("Full output");
    expect(html).toContain("&quot;minHeight&quot;:48");
  });
  it("reserves a real 48dp target and lets large text grow instead of clipping a fixed-height row", () => {
    const html = renderToStaticMarkup(createElement(ChatActivity, { title: "Read workspace recovery preferences", onInspect: vi.fn() }));
    expect(html).toContain("&quot;minHeight&quot;:48");
    expect(html).not.toContain("&quot;height&quot;:28");
  });
  it("shows the filename first while retaining the full path in the accessible inspector name", () => {
    const title = "Read /Users/name/project/src/features/settings/preferences.tsx";
    const html = renderToStaticMarkup(createElement(ChatActivity, {
      title, status: "complete", onInspect: vi.fn(),
    }));
    expect(html).toContain(`aria-label="${title}. Completed"`);
    expect(html).toMatch(/>Read preferences\.tsx<\//);
    // A collapsed row is a single line: the directory stays in the accessible name only.
    expect(html.replace(/aria-label="[^"]*"/, "")).not.toContain("/Users/name/project/src/features/settings/");
  });
  it("keeps title metrics stable across running, settled and reduced motion", () => {
    fixture.active = true;
    const styles = (status: "running" | "complete", reduced: boolean) => {
      fixture.reduced = reduced;
      const html = renderToStaticMarkup(
        createElement(ChatActivity, { title: "Read source", status }),
      );
      return html.match(/data-text-style="([^"]+)"/)?.[1];
    };
    expect(styles("running", false)).toBe(styles("complete", false));
    expect(styles("running", true)).toBe(styles("complete", false));
    expect(styles("running", false)).toContain("14");
  });

  it("announces state and visible detail for an inspector without false inline expansion", () => {
    fixture.reduced = true;
    const html = renderToStaticMarkup(
      createElement(ChatActivity, {
        title: "Read source",
        detail: "src/chat.tsx",
        status: "stopped",
        onInspect: vi.fn(),
      }),
    );
    expect(html).toContain('aria-label="Read source. Stopped. src/chat.tsx"');
    expect(html).not.toContain("aria-expanded");
    expect(html).toContain(">Stopped<");
    expect(html).not.toContain("Pending");
  });

  it("retains expanded semantics for actual inline disclosure", () => {
    const html = renderToStaticMarkup(
      createElement(ChatActivity, { title: "Read source", status: "complete" }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Read source. Completed"');
  });

  it("stops running activity animation while hidden without changing its semantic status or title", () => {
    fixture.reduced = false;
    fixture.active = true;
    const render = () =>
      renderToStaticMarkup(createElement(ChatActivity, { title: "Working", status: "running" }));
    expect(render()).toContain('data-animating="true"');
    fixture.active = false;
    const hidden = render();
    expect(hidden).toContain('data-animating="false"');
    expect(hidden).toContain('data-status="running"');
    expect(hidden).toContain("Working");
    fixture.active = true;
    expect(render()).toContain('data-animating="true"');
  });

  it("keeps completed activity static and honors live reduced motion", () => {
    fixture.active = true;
    fixture.reduced = false;
    expect(
      renderToStaticMarkup(createElement(ChatActivity, { title: "Done", status: "complete" })),
    ).not.toContain("data-animating");
    fixture.reduced = true;
    expect(
      renderToStaticMarkup(createElement(ChatActivity, { title: "Working", status: "running" })),
    ).not.toContain("data-animating");
  });

  it("suspends the streaming label for hidden or reduced-motion states and restarts on return", () => {
    const render = () => renderToStaticMarkup(createElement(ChatStreaming, { label: "Writing" }));
    fixture.active = true;
    fixture.reduced = false;
    expect(render()).toContain('data-animating="true"');
    fixture.active = false;
    expect(render()).toContain('data-animating="false"');
    fixture.active = true;
    fixture.reduced = true;
    expect(render()).toContain('data-animating="false"');
    fixture.reduced = false;
    expect(render()).toContain('data-animating="true"');
  });
});
