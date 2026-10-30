import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  size: "standard" as "compact" | "standard" | "large",
  shared: vi.fn(),
  bubble: vi.fn(),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => {} }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ enterItem: () => undefined }));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: PropsWithChildren) => createElement("div", null, children) },
}));
vi.mock("@/state/chat-appearance", () => ({
  useChatAppearance: (select: (s: unknown) => unknown) =>
    select({ textSize: state.size, hydrated: true, setTextSize: () => {}, storageError: null }),
}));
vi.mock("@/ui/chat", () => ({
  ChatMessage: ({ children, role, style }: PropsWithChildren<{ role: string; style: unknown }>) =>
    createElement("article", { "data-role": role, "data-bubble": JSON.stringify(style) }, children),
  ChatResponse: ({
    message,
  }: {
    message: { id: string; role: string; parts: { type: string; text: string }[] };
  }) => {
    state.shared(message);
    return createElement("div", { "data-shared-reader": message.role }, message.parts[0].text);
  },
  chatUserBubbleStyle: () => {
    state.bubble();
    return { maxWidth: "85%" };
  },
}));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Wrap,
    Card: Wrap,
    Stack: Wrap,
    Section: Wrap,
    Notice: () => null,
    SegmentedControl: () => null,
  };
});
import { ChatAppearanceSettings } from "./chat-appearance-settings";
it("delegates both preview roles to actual chat owners and includes source-faithful code and an underlined-link candidate without host context", () => {
  const html = renderToStaticMarkup(createElement(ChatAppearanceSettings));
  expect(html).toContain('data-shared-reader="user"');
  expect(html).toContain('data-shared-reader="assistant"');
  expect(state.bubble).toHaveBeenCalled();
  expect(html).toContain("85%");
  const messages = state.shared.mock.calls.map(([message]) => message);
  expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  expect(messages[1].parts[0].text).toContain("```typescript\nconst status = 'ready';\n```");
  expect(messages[1].parts[0].text).toContain("[Markdown](https://commonmark.org/help/)");
  expect(messages.every((m) => Object.keys(m).sort().join(",") === "id,parts,role")).toBe(true);
});
