// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({ router: { push: f.push } }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("lucide-react-native/icons/settings-2", () => ({ default: () => null }));
vi.mock("./voice-choices", () => ({ VoiceChoices: () => h("p", null, "Voice runtime controls") }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => h("div", null, children);
  return {
    IconButton: ({ label, onPress }: { label: string; onPress(): void }) => h("button", { onClick: onPress }, label),
    Sheet: ({ visible, title, children }: PropsWithChildren<{ visible: boolean; title: string }>) => visible ? h("section", { "aria-label": title }, children) : null,
    Section: ({ title, children }: PropsWithChildren<{ title: string }>) => h("div", null, h("h2", null, title), children),
    NavigationGroup: Group,
    NavigationRow: ({ label, onPress }: { label: string; onPress(): void }) => h("button", { onClick: onPress }, label),
  };
});
import { CallVoiceButton } from "./call-voice-button";

// The gear opened a sheet titled "Settings" with voice folded away; it is the assistant's settings with the desktop groups.
it("opens the assistant settings with this conversation, voice and work groups, and links to all voice settings", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(h(CallVoiceButton, { details: h("p", null, "Work and access") }, h("p", null, "Reply model"))));
    expect(container.textContent).toBe("Assistant settings");
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector("section")?.getAttribute("aria-label")).toBe("Assistant settings");
    expect([...container.querySelectorAll("h2")].map(heading => heading.textContent)).toEqual(["This conversation", "Voice"]);
    expect(container.textContent).toContain("Reply model");
    expect(container.textContent).toContain("Voice runtime controls");
    expect(container.textContent).toContain("Work and access");
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "All voice settings")!.click());
    expect(f.push).toHaveBeenCalledWith("/settings/voice");
    expect(container.querySelector("section")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
