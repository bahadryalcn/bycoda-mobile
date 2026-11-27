// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({ router: { push: f.push } }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("lucide-react-native/icons/settings-2", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/audio-lines", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/sparkles", () => ({ default: () => null }));
vi.mock("./voice-settings", () => ({ VOICE_SETTINGS_ROUTE: "/settings/voice", useVoiceSettingsSummary: () => "Voice: Male 1" }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => h("div", null, children);
  return {
    IconButton: ({ label, onPress }: { label: string; onPress(): void }) => h("button", { onClick: onPress }, label),
    Sheet: ({ visible, title, children }: PropsWithChildren<{ visible: boolean; title: string }>) => visible ? h("section", { "aria-label": title }, children) : null,
    Section: ({ title, children }: PropsWithChildren<{ title: string }>) => h("div", null, h("h2", null, title), children),
    NavigationGroup: Group,
    NavigationRow: ({ label, detail, onPress }: { label: string; detail?: string; onPress(): void }) => h("button", { onClick: onPress, "data-detail": detail }, label),
    SettingIcon: () => null,
  };
});
import { AssistantSettingsButton } from "./call-voice-button";

// Voice choices sat both in this sheet and on Settings → Voice assistant; status, notifications, the
// computer and access then moved to Settings → Assistant. The sheet keeps this conversation and links out.
it("opens the assistant settings with this conversation only and rows to voice and assistant settings", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(h(AssistantSettingsButton, null, h("p", null, "Scope"), h("p", null, "Reply model"))));
    expect(container.textContent).toBe("Assistant settings");
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector("section")?.getAttribute("aria-label")).toBe("Assistant settings");
    expect(container.querySelectorAll("h2")).toHaveLength(0);
    expect(container.textContent).toContain("Scope");
    expect(container.textContent).toContain("Reply model");
    // Notification, computer and permission fields are no longer in the sheet.
    for (const text of ["Status", "My presence", "Notifications", "Repeat urgent notifications", "Telegram", "Keep the computer awake", "Access", "Permission level", "Always ask separately"])
      expect(container.textContent).not.toContain(text);
    const row = [...container.querySelectorAll("button")].find(button => button.textContent === "Assistant" && button.closest("section"));
    expect(row?.getAttribute("data-detail")).toBe("Notifications, permissions");
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Voice and microphone")!.click());
    expect(f.push).toHaveBeenCalledWith("/settings/voice");
    expect(container.querySelector("section")).toBeNull();
    await act(async () => container.querySelector("button")!.click());
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>("section button")].find(button => button.textContent === "Assistant")!.click());
    expect(f.push).toHaveBeenLastCalledWith("/settings/assistant");
    expect(container.querySelector("section")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
