import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  size: "standard" as "compact" | "standard" | "large",
  hydrated: true,
  shared: vi.fn(),
  bubble: vi.fn(),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/state/actions", () => ({ useAsyncAction: () => ({isPending:false,run:(work:()=>Promise<void>)=>work()}) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ enterItem: () => undefined }));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: PropsWithChildren) => createElement("div", null, children) },
}));
vi.mock("@/state/chat-appearance", () => ({
  useChatAppearance: (select: (s: unknown) => unknown) =>
    select({ textSize: state.size, hydrated: state.hydrated, setTextSize: () => {}, storageError: null }),
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
    Skeleton: ({label}: {label?:string}) => createElement("p", {role:"progressbar","aria-label":label ?? "Loading…"}, label ?? "Loading…"),
    Loading: ({label}: {label:string}) => createElement("p", {role:"progressbar","aria-label":label},label),
    SegmentedControl: () => null,
  };
});
import { ChatAppearanceSettings } from "./chat-appearance-settings";
it("names the pending preference read while preserving the shared preview",()=>{
  state.hydrated=false;
  try {
    const html=renderToStaticMarkup(createElement(ChatAppearanceSettings));
    expect(html).toContain('role="progressbar"');expect(html).toContain('aria-label="Loading…"');
    expect(html).toContain('data-shared-reader="assistant"');
  } finally {state.hydrated=true;}
});
it("delegates both preview roles to actual chat owners and includes source-faithful code without an unrelated help link without host context", () => {
  const html = renderToStaticMarkup(createElement(ChatAppearanceSettings));
  expect(html).toContain('data-shared-reader="user"');
  expect(html).toContain('data-shared-reader="assistant"');
  expect(state.bubble).toHaveBeenCalled();
  expect(html).toContain("85%");
  const messages = state.shared.mock.calls.map(([message]) => message);
  expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  expect(messages[1].parts[0].text).toContain("```typescript\nconst status = 'ready';\n```");
  expect(messages[1].parts[0].text).not.toContain("commonmark.org");
  expect(messages.every((m) => Object.keys(m).sort().join(",") === "id,parts,role")).toBe(true);
});
