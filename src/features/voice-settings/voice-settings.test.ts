// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  installed: true, job: { state: "idle" } as Record<string, unknown>,
  modelsRefetch: vi.fn(), action: vi.fn(async () => ({})),
}));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("lucide-react-native/icons/chevron-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/audio-lines", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string>) => en.replace(/\{(\w+)\}/g, (_m, key: string) => values?.[key] ?? "") }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestCloseThen: (next: () => void) => next() }) }));
vi.mock("@/ui/tokens", () => ({ space: {} }));
vi.mock("../settings/local-data-sizes", () => ({ formatBytes: (value: number) => `${value} B` }));
vi.mock("./voice-preferences", () => ({
  useVoicePreferences: () => ({ preferences: { engine: "local", micOrder: [] }, hydrated: true }),
  voicePreferences: { getState: () => ({ update: vi.fn(async () => undefined) }) }, moveVisibleMic: vi.fn(), visibleMics: (order: unknown[]) => order,
}));
vi.mock("@/state/machines", () => {
  const machine = { id: "m", name: "Office PC", capabilities: ["voice.local.v1"] };
  const state = { hydrated: true, connectionPending: false, storageError: null };
  return { useActiveMachine: () => machine, useMachines: (select: (value: typeof state) => unknown) => select(state) };
});
vi.mock("@/state/queries", () => ({
  useHostQuery: (key: string[]) => {
    if (key[1] === "models") return { data: [{ id: "small", label: "Whisper small", installed: f.installed }], refetch: f.modelsRefetch };
    if (key[1] === "modelStatus") return { data: f.job, refetch: async () => ({ data: f.job }) };
    return { data: undefined, isSuccess: false };
  },
  useHostMutation: (method: string) => ({ mutateAsync: method === "voice.local.modelAction" ? f.action : vi.fn(), isPending: false }),
}));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => h("div", null, children);
  const Button = ({ label, onPress }: { label: string; onPress(): void }) => h("button", { onClick: onPress }, label);
  return {
    Button, IconButton: Group, Stack: Group, NavigationGroup: Group, SectionHeader: ({ title }: { title: string }) => h("h2", null, title),
    Notice: ({ message }: { message: string }) => h("p", null, message), ErrorNotice: () => null, QueryState: () => null,
    SettingIcon: () => null, SegmentedRow: () => null,
    SelectRow: ({ label, detail }: { label: string; detail?: string }) => h("p", null, label, detail),
    ChoiceChip: ({ label }: { label: string }) => h("span", null, label),
    NavigationRow: ({ label, detail, onPress }: { label: string; detail: string; onPress(): void }) => h("button", { onClick: onPress }, label, detail),
    Sheet: ({ visible, children }: PropsWithChildren<{ visible: boolean }>) => (visible ? h("section", null, children) : null),
    ValueRow: ({ label, value }: { label: string; value: string }) => h("div", null, `${label}: ${value}`),
    ConfirmationCard: ({ confirmLabel, onConfirm, message }: { confirmLabel: string; onConfirm(): void; message: string }) =>
      h("div", null, message, h("button", { onClick: onConfirm, "data-confirm": true }, confirmLabel)),
  };
});
import { VoiceSettings } from "./voice-settings";
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); vi.unstubAllGlobals(); vi.clearAllMocks(); f.installed = true; f.job = { state: "idle" }; });

it("names the computer and refreshes the list when a removal settles before any poll", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  await act(async () => root.render(h(VoiceSettings)));
  // The row names the assistant's voice and who understands the owner, not an unexplained "transcription".
  expect(container.textContent).toContain("Male 1 · Office PC");
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toContain("Voice models on Office PC");
  expect(container.textContent).toContain("Whisper small: Installed on Office PC");
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Remove")!.click());
  expect(container.textContent).toContain("Remove Whisper small from Office PC?");
  // The Host finishes the removal before the phone ever reads a working job.
  f.job = { state: "ready", id: "small", action: "delete" };
  await act(async () => container.querySelector<HTMLButtonElement>("[data-confirm]")!.click());
  expect(f.action).toHaveBeenCalledWith({ action: "delete", id: "small" });
  expect(f.modelsRefetch).toHaveBeenCalledOnce();
});
