import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ shared: vi.fn(), bubble: vi.fn() }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/chat-styles", () => ({ useChatTextStyles: () => ({ author: {} }) }));
vi.mock("@/state/chat-appearance", () => ({
  useChatAppearance: (select: (s: unknown) => unknown) => select({ textSize: "standard" }),
}));
vi.mock("@/ui/chat", () => ({
  ChatMessage: ({ children, role, style }: PropsWithChildren<{ role: string; style: unknown }>) =>
    createElement("article", { "data-role": role, "data-bubble": JSON.stringify(style) }, children),
  ChatResponse: ({ message }: { message: { id: string; role: string; parts: { type: string; text: string }[] } }) => {
    state.shared(message);
    return createElement("div", { "data-shared-reader": message.role }, message.parts[0].text);
  },
  chatUserBubbleStyle: () => ({ maxWidth: "85%" }),
}));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const tag = (name: string) => ({ children }: PropsWithChildren) => createElement("div", { "data-owner": name }, children);
  return {
    Body: Wrap,
    Card: tag("card"),
    Heading: tag("heading"),
    Stack: Wrap,
    Section: ({ title, children }: PropsWithChildren<{ title: string }>) => createElement("section", { "aria-label": title }, children),
    Badge: ({ label }: { label: string }) => createElement("span", { "data-owner": "badge" }, label),
  };
});
import { AppearancePreview } from "./appearance-preview";

it("renders general text from shared components together with both chat roles", () => {
  const html = renderToStaticMarkup(createElement(AppearancePreview));
  expect(html).toContain('aria-label="Preview"');
  for (const owner of ["card", "heading", "badge"]) expect(html).toContain(`data-owner="${owner}"`);
  expect(html).toContain('data-shared-reader="user"');
  expect(html).toContain('data-shared-reader="assistant"');
  expect(html).toContain("85%");
});
it("uses source-faithful chat messages without extra fields or help links", () => {
  renderToStaticMarkup(createElement(AppearancePreview));
  const messages = state.shared.mock.calls.map(([message]) => message);
  expect(messages.slice(-2).map((m) => m.role)).toEqual(["user", "assistant"]);
  const assistant = messages.at(-1);
  expect(assistant.parts[0].text).toContain("```typescript\nconst status = 'ready';\n```");
  expect(assistant.parts[0].text).not.toContain("commonmark.org");
  expect(messages.every((m) => Object.keys(m).sort().join(",") === "id,parts,role")).toBe(true);
});
