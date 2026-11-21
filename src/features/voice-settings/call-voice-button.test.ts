// @vitest-environment happy-dom
import { act, createElement as h, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CallVoiceButton } from "./call-voice-button";

vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("lucide-react-native/icons/settings-2", () => ({ default: () => null }));
vi.mock("./voice-choices", () => ({ VoiceChoices: () => h("p", null, "Voice runtime controls") }));
vi.mock("@/ui/primitives", () => ({
  IconButton: ({ label, onPress }: { label: string; onPress(): void }) => h("button", { onClick: onPress }, label),
  Sheet: ({ visible, children }: PropsWithChildren<{ visible: boolean }>) => visible ? h("section", null, children) : null,
  Disclosure: ({ label, children }: PropsWithChildren<{ label: string }>) => {
    const [open, setOpen] = useState(false);
    return h("div", null, h("button", { onClick: () => setOpen(true) }, label), open ? children : null);
  },
}));

it("opens the model settings without mounting voice setup until requested", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(h(CallVoiceButton, null, h("p", null, "Reply model"))));
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("Reply model");
    expect(container.textContent).not.toContain("Voice runtime controls");
    await act(async () => container.querySelector<HTMLButtonElement>("section button")!.click());
    expect(container.textContent).toContain("Voice runtime controls");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
