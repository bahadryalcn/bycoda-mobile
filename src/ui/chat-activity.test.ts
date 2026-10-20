import { describe, expect, it, vi } from "vitest";
import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const fixture = vi.hoisted(() => ({ active: true, reduced: false }));
vi.mock("@/state/queries", () => ({ useHostReadActive: () => fixture.active }));
vi.mock("./use-reduced-motion", () => ({ useReducedMotionPreference: () => fixture.reduced }));
vi.mock("./theme", () => ({ useMobileTheme: vi.fn() }));
vi.mock("./styles", () => ({ uiStyles: { label: {}, caption: {} } }));
vi.mock("./tokens", () => ({ colors: {}, space: {} }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("./typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/sparkles", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/terminal", () => ({ default: () => null }));
vi.mock("panelui-native/components/task", () => {
  const Task = Object.assign(({ status, children }: PropsWithChildren<{ status: string }>) =>
    createElement("section", { "data-status": status }, children), {
    Trigger: ({ children }: PropsWithChildren) => createElement("div", null, children),
    Content: ({ children }: PropsWithChildren) => createElement("div", null, children),
  });
  return { Task };
});
vi.mock("panelui-native/components/reasoning", () => ({ Reasoning: "div" }));
vi.mock("panelui-native/components/plan", () => ({ Plan: "div" }));
vi.mock("panelui-native/components/shimmer", () => ({
  Shimmer: ({ enabled, children }: PropsWithChildren<{ enabled: boolean }>) =>
    createElement("span", { "data-animating": String(enabled) }, children),
}));
import { ChatActivity, ChatStreaming } from "./chat-activity";

describe("chat continuous animation lifecycle", () => {
  it("stops running activity animation while hidden without changing its semantic status or title", () => {
    fixture.reduced = false;
    fixture.active = true;
    const render = () => renderToStaticMarkup(createElement(ChatActivity, { title: "Working", status: "running" }));
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
    expect(renderToStaticMarkup(createElement(ChatActivity, { title: "Done", status: "complete" }))).not.toContain("data-animating");
    fixture.reduced = true;
    expect(renderToStaticMarkup(createElement(ChatActivity, { title: "Working", status: "running" }))).not.toContain("data-animating");
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
