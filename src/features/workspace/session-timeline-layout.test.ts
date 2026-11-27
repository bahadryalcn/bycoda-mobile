// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Linking } from "react-native";
import { LoopbackLinkProvider } from "@/ui/loopback-link";

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
  ErrorText: ({ error }: { error?: unknown }) => error ? createElement("p", null, String(error)) : null,
  PressableCard: ({ children }: PropsWithChildren) => createElement("button", null, children),
}));
vi.mock("panelui-native/components/chip", () => ({ Chip: ({ children, onPress }: PropsWithChildren<{ onPress: () => void }>) => createElement("button", { onClick: onPress }, children) }));
vi.mock("lucide-react-native/icons/link", () => ({ default: () => null }));
vi.mock("./activity-group", () => ({ ActivityGroup: () => createElement("button", { style: { minHeight: 48 } }, "Work") }));
vi.mock("./transcript-block", () => ({ TranscriptBlock: () => null }));
vi.mock("./transcript-subagents", () => ({ TranscriptSubagents: () => null }));
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

it("opens loopback chips only under their own session and leaves public links external", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const open = vi.fn();
  const href = "http://localhost:3000/app?tab=1#top";
  const external = "https://example.com/";
  vi.mocked(Linking.openURL).mockResolvedValue(undefined);
  const useScope = (ownerScope: string) => act(async () => root.render(createElement(
    LoopbackLinkProvider,
    { value: { scope: "session-a", open } },
    createElement(ComposerLinks, { ownerScope, links: [
      { href, host: "localhost", path: "/app" },
      { href: external, host: "example.com", path: "" },
    ] }),
  )));
  try {
    await useScope("session-b");
    await act(async () => container.querySelectorAll("button")[0].click());
    expect(open).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Record access is unavailable.");
    await useScope("session-a");
    await act(async () => container.querySelectorAll("button")[0].click());
    expect(open).toHaveBeenCalledWith(href);
    await act(async () => container.querySelectorAll("button")[1].click());
    expect(Linking.openURL).toHaveBeenCalledWith(external);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
