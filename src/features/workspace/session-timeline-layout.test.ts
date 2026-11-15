import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children, style }: PropsWithChildren<{ style?: object }>) =>
    createElement("div", { "data-layout": JSON.stringify(style) }, children),
  ScrollView: ({ children, style }: PropsWithChildren<{ style?: object }>) =>
    createElement("section", { "data-scroll-layout": JSON.stringify(style) }, children),
  Linking: { openURL: vi.fn() },
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children }: PropsWithChildren) => createElement("span", null, children),
  ErrorText: () => null,
  PressableCard: ({ children }: PropsWithChildren) => createElement("button", null, children),
}));
vi.mock("lucide-react-native/icons/link", () => ({ default: () => null }));
vi.mock("./activity-group", () => ({ ActivityGroup: () => createElement("button", { style: { minHeight: 48 } }, "Work") }));
vi.mock("./transcript-block", () => ({ TranscriptBlock: () => null }));
vi.mock("./transcript-model", () => ({ isSystemFailure: () => false }));
vi.mock("./system-failure-card", () => ({ SystemFailureCard: () => null }));
vi.mock("./turn-chrome", () => ({ TurnFooter: () => createElement("footer", null, "Turn"), ModelSwitchDivider: () => null, ModelSwitchRow: () => null }));
import { TranscriptRow, type TranscriptRowProps } from "./transcript-row";
import { ComposerLinks } from "./composer-links";

it.each([false, true])("measures activity touch targets in normal flow, footer=%s", (footer) => {
  const props: TranscriptRowProps = {
    item: { id: "activity", kind: "activity", blocks: [], footer: footer ? { id: "user", role: "user", text: "Prompt" } : undefined }, highlighted: false, live: true,
    getRevision: () => 1, responseText: () => undefined, scope: { machineId: "m", sessionId: "s" },
    disabled: false, onCommand: vi.fn(), onInspect: vi.fn(),
  };
  const html = renderToStaticMarkup(createElement(TranscriptRow, props));
  expect(html).toContain("min-height:48px");
  expect(html).not.toContain("&quot;height&quot;");
  expect(html.includes("<footer>Turn</footer>")).toBe(footer);
});

it("keeps message link chips intrinsic height instead of filling the virtual cell", () => {
  const html = renderToStaticMarkup(createElement(ComposerLinks, {
    links: [{ href: "https://is-agentic.com", host: "is-agentic.com", path: "" }],
  }));
  expect(html).toContain("&quot;flexGrow&quot;:0");
  expect(html).toContain("&quot;flexShrink&quot;:0");
});
