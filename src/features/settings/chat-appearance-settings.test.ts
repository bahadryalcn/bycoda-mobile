import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  size: "standard" as "compact" | "standard" | "large",
  hydrated: true,
  setTextSize: vi.fn(),
  segmented: undefined as undefined | Record<string, any>,
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/actions", () => ({ useAsyncAction: () => ({isPending:false,run:(work:()=>Promise<void>)=>work()}) }));
vi.mock("@/state/chat-appearance", () => ({
  useChatAppearance: (select: (s: unknown) => unknown) =>
    select({ textSize: state.size, hydrated: state.hydrated, setTextSize: state.setTextSize, storageError: null, retryStorage: () => Promise.resolve() }),
}));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Stack: Wrap,
    Section: ({ title, children }: PropsWithChildren<{ title: string }>) => createElement("section", { "aria-label": title }, children),
    Notice: () => null,
    Skeleton: ({label}: {label?:string}) => createElement("p", {role:"progressbar","aria-label":label ?? "Loading…"}, label ?? "Loading…"),
    SegmentedControl: (props: Record<string, any>) => { state.segmented = props; return null; },
  };
});
import { ChatAppearanceSettings } from "./chat-appearance-settings";
it("names the pending preference read and disables the selector until hydrated",()=>{
  state.hydrated=false;
  try {
    const html=renderToStaticMarkup(createElement(ChatAppearanceSettings));
    expect(html).toContain('role="progressbar"');expect(html).toContain('aria-label="Loading…"');
    expect(state.segmented).toMatchObject({ disabled: true, value: "standard" });
  } finally {state.hydrated=true;}
});
it("keeps the three named message sizes and persists a choice", () => {
  const html = renderToStaticMarkup(createElement(ChatAppearanceSettings));
  expect(html).toContain('aria-label="Message text size"');
  expect(state.segmented!.options.map((o: { value: string }) => o.value)).toEqual(["compact", "standard", "large"]);
  expect(state.segmented).toMatchObject({ disabled: false, hideLabel: true });
  state.segmented!.onChange("large");
  expect(state.setTextSize).toHaveBeenCalledWith("large");
});
