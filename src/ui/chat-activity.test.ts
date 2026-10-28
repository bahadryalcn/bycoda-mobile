import { describe, expect, it, vi } from "vitest";
import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const fixture = vi.hoisted(() => ({ active: true, reduced: false }));
vi.mock("@/state/queries", () => ({ useHostReadActive: () => fixture.active }));
vi.mock("./use-reduced-motion", () => ({ useReducedMotionPreference: () => fixture.reduced }));
vi.mock("./theme", () => ({ useMobileTheme: vi.fn() }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./styles", () => ({
  uiStyles: { label: { fontSize: 17, lineHeight: 22 }, caption: { fontSize: 13, lineHeight: 18 } },
}));
vi.mock("./tokens", () => ({
  colors: { text: "ink", danger: "danger", muted: "muted" },
  space: {},
  metrics: { touchTarget: 48 },
  radii: {},
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Pressable: ({
    children,
    accessibilityLabel,
    accessibilityState,
  }: PropsWithChildren<{
    accessibilityLabel: string;
    accessibilityState?: { expanded?: boolean };
  }>) =>
    createElement(
      "button",
      { "aria-label": accessibilityLabel, "aria-expanded": accessibilityState?.expanded },
      children,
    ),
}));
vi.mock("./typography", () => ({
  Body: ({ children, style }: PropsWithChildren<{ style?: object }>) =>
    createElement("span", { "data-text-style": JSON.stringify(style) }, children),
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
  it("shows the filename first while retaining the full path in the accessible inspector name", () => {
    const title = "Read /Users/name/project/src/features/settings/preferences.tsx";
    const html = renderToStaticMarkup(createElement(ChatActivity, {
      title, status: "complete", onInspect: vi.fn(),
    }));
    expect(html).toContain(`aria-label="${title}. Completed"`);
    expect(html).toMatch(/>Read preferences\.tsx<\//);
    expect(html).toContain("/Users/name/project/src/features/settings/ · Completed");
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
    expect(styles("running", false)).toContain("13");
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
    expect(html).toContain('aria-label="Read source. Interrupted. src/chat.tsx"');
    expect(html).not.toContain("aria-expanded");
    expect(html).toContain("Interrupted · src/chat.tsx");
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
