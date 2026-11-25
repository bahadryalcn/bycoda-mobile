// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { VoicePreferences } from "./voice-preferences";
type Option = { value: string; label: string; detail?: string; disabled?: boolean };
const f = vi.hoisted(() => ({
  installed: true, disconnected: false, job: { state: "idle" } as Record<string, unknown>,
  cloud: undefined as Record<string, boolean> | undefined,
  modelsRefetch: vi.fn(), action: vi.fn(async () => ({})),
  scope: "office-1", pairing: "office", computer: "Office PC" as string | null,
  eleven: false, manual: false, blur: undefined as undefined | (() => void), draft: undefined as undefined | ((value: string) => void),
  confirm: undefined as undefined | (() => void),
  selects: new Map<string, { options: Option[]; onChange(value: string): void; disabled?: boolean }>(),
  toggles: new Map<string, (value: boolean) => void>(),
  persist: vi.fn(), beforePatch: undefined as undefined | Promise<void>, push: vi.fn(), navigate: vi.fn(),
  preferenceError: null as { operation: "save" } | null, retryPreferences: vi.fn(async () => {}),
}));
vi.mock("expo-router", () => ({ router: { navigate: f.navigate, push: f.push } }));
vi.mock("./microphone-priority", () => ({ MicrophonePriority: () => h("p", null, "Input device") }));
vi.mock("./microphone-access", () => ({ MicrophoneAccessRow: () => h("p", null, "Microphone access") }));
vi.mock("../settings/settings-page", () => ({ SettingsPage: ({ title, children }: PropsWithChildren<{ title: string }>) => h("main", { "aria-label": title }, children) }));
vi.mock("lucide-react-native/icons/audio-lines", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string>) => en.replace(/\{(\w+)\}/g, (_m, key: string) => values?.[key] ?? "") }));
vi.mock("../settings/local-data-sizes", () => ({ formatBytes: (value: number) => `${value} B` }));
vi.mock("./voice-preferences", () => ({
  SUPERTONIC_SPEAKERS: ["M1", "F1"], TURN_PAUSES: [1.2, 2.5, 4],
  useVoicePreferences: () => ({ preferences: { engine: "local", micOrder: [], speech: "supertonic", speaker: "M1", turnPause: 1.2, manualTurnEnd: f.manual,
    ...(f.eleven ? { speech: "elevenlabs", elevenVoice: "SavedVoice" } : {}) }, hydrated: true,
    storageError: f.preferenceError, retry: f.retryPreferences }),
  voicePreferences: { getState: () => ({ update: async (update: Partial<VoicePreferences> | (() => Partial<VoicePreferences>)) => {
    await f.beforePatch;
    f.persist(typeof update === "function" ? update() : update);
  } }) },
}));
vi.mock("@/state/connection-scope", () => ({
  useConnectionScope: () => {
    const token = f.scope;
    return { token, isCurrent: () => token === f.scope, review: { id: "m", environmentId: f.pairing } };
  },
  sameReviewedMachine: (left: { environmentId: string }, right: { environmentId: string }) => left.environmentId === right.environmentId,
}));
vi.mock("@/state/machines", () => {
  const machine = { id: "m", capabilities: ["voice.local.v1", "voice.cloud.v1"] };
  const state = { hydrated: true, connectionPending: false, storageError: null };
  return { useActiveMachine: () => (f.computer ? { ...machine, name: f.computer } : undefined), useMachines: (select: (value: typeof state) => unknown) => select(state) };
});
vi.mock("@/state/host-runtime-state", () => ({ useActiveHostLinkDown: () => f.disconnected }));
vi.mock("@/state/queries", () => ({
  useHostQuery: (key: string[]) => {
    if (key[1] === "models") return { data: [{ id: "small", label: "Whisper small", installed: f.installed }], isSuccess: true, refetch: f.modelsRefetch };
    if (key[1] === "modelStatus") return { data: f.job, refetch: async () => ({ data: f.job }) };
    if (key[1] === "cloud") return { data: f.cloud, isSuccess: f.cloud !== undefined };
    return { data: undefined, isSuccess: false };
  },
  useHostMutation: (method: string) => ({ mutateAsync: method === "voice.local.modelAction" ? f.action : vi.fn(), isPending: false }),
}));
vi.mock("@/ui/primitives", async () => {
  const { useState } = await import("react");
  const Group = ({ children }: PropsWithChildren) => h("div", null, children);
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress(): void }) => h("button", { onClick: onPress, disabled }, label);
  return {
    Body: Group, Button, Stack: Group, NavigationGroup: Group,
    Disclosure: ({ label, children }: PropsWithChildren<{ label: string }>) => {
      const [open, setOpen] = useState(false);
      return h("section", null, h(Button, { label, onPress: () => setOpen(!open) }), open && children);
    },
    Section: ({ title, children }: PropsWithChildren<{ title: string }>) => h("section", null, h("h2", null, title), children),
    Notice: ({ message, onRetry }: { message: string; onRetry?: () => void }) => h("div", null, message,
      onRetry ? h(Button, { label: "Retry", onPress: onRetry }) : null), ErrorNotice: () => null, QueryState: () => null,
    SettingIcon: () => null,
    StateView: ({ title, action }: { title: string; action?: { label: string; onPress(): void } }) => h("div", null, title, action ? h(Button, { label: action.label, onPress: action.onPress }) : null),
    ScopeLine: () => null, StatusText: ({ label }: { label: string }) => h("span", null, label),
    SelectField: ({ label, value, options, onChange, disabled }: { label: string; value: string; options: Option[]; onChange(value: string): void; disabled?: boolean }) => {
      f.selects.set(label, { options, onChange, disabled });
      return h("p", { "data-select": label }, `${label}: ${options.find(option => option.value === value)?.label ?? ""}`);
    },
    ToggleField: ({ label, onChange }: { label: string; onChange(value: boolean): void }) => { f.toggles.set(label, onChange); return h("p", null, label); },
    Input: ({ value, onChangeText, onBlur }: { value: string; onChangeText(value: string): void; onBlur(): void }) => {
      f.draft = onChangeText; f.blur = onBlur;
      return h("input", { value, readOnly: true });
    },
    NavigationRow: ({ label, detail, trailing, onPress }: { label: string; detail: string; trailing?: unknown; onPress(): void }) =>
      h("div", null, h("button", { onClick: onPress }, label, detail ? `: ${detail}` : ""), trailing as never),
    ValueRow: ({ label, value, trailing, children }: PropsWithChildren<{ label: string; value?: string; trailing?: ReactNode }>) =>
      h("div", null, label, value ?? ": ", children, trailing),
    ActionMenu: ({ actions }: { actions: { key: string; label: string; onPress(): void }[] }) =>
      h("span", null, ...actions.map(action => h("button", { key: action.key, onClick: action.onPress }, action.label))),
    ConfirmationCard: ({ confirmLabel, onConfirm, message }: { confirmLabel: string; onConfirm(): void; message: string }) => {
      f.confirm = onConfirm;
      return h("div", null, message, h("button", { onClick: onConfirm, "data-confirm": true }, confirmLabel));
    },
  };
});
import { VoiceSettings, VoiceSettingsScreen } from "./voice-settings";
import { VoiceChoices } from "./voice-choices";
let root: ReturnType<typeof createRoot>;
function mount() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"); root = createRoot(container); return container; }
const select = (label: string) => f.selects.get(label)!;
const button = (container: HTMLElement, text: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === text)!;
afterEach(async () => {
  await act(async () => root?.unmount()); vi.unstubAllGlobals(); vi.clearAllMocks(); f.selects.clear(); f.toggles.clear();
  Object.assign(f, { installed: true, job: { state: "idle" }, cloud: undefined, scope: "office-1", pairing: "office",
    computer: "Office PC", eleven: false, manual: false, draft: undefined, blur: undefined, confirm: undefined, beforePatch: undefined, preferenceError: null, disconnected: false });
});

// With no computer the row read "Male 1 · Connected computer".
it("never claims a connection that does not exist and opens the Voice assistant page", async () => {
  const container = mount();
  f.computer = null;
  await act(async () => root.render(h(VoiceSettings)));
  expect(container.textContent).toBe("Voice assistant: Connect a computer");
  f.computer = "Office PC";
  await act(async () => root.render(h(VoiceSettings)));
  expect(container.textContent).toBe("Voice assistant: Voice: Male 1");
  await act(async () => container.querySelector("button")!.click());
  expect(f.push).toHaveBeenCalledWith("/settings/voice");
});

it("shows the unpaired page as one state with Connect, keeping the phone's microphone group", async () => {
  const container = mount();
  f.computer = null;
  await act(async () => root.render(h(VoiceSettingsScreen)));
  expect(container.querySelector("main")?.getAttribute("aria-label")).toBe("Voice assistant");
  expect(container.textContent).toContain("Voice needs a connected computer");
  expect([...container.querySelectorAll("h2")].map(heading => heading.textContent)).toEqual(["Microphone"]);
  await act(async () => button(container, "Connect a computer").click());
  expect(f.navigate).toHaveBeenCalledWith("/machines");
});

it("uses the desktop groups and words, and names what each recognition choice needs", async () => {
  const container = mount();
  f.cloud = { openrouter: true };
  await act(async () => root.render(h(VoiceSettingsScreen)));
  expect([...container.querySelectorAll("h2")].map(heading => heading.textContent)).toEqual(
    ["Microphone", "Dictation", "Conversation style"]);
  expect(container.textContent).not.toContain("Voice provider");
  const recognition = select("Dictation recognition").options;
  expect(recognition.map(option => option.label)).toEqual(["This computer", "OpenRouter", "OpenAI", "Grok"]);
  expect(recognition[2]).toMatchObject({ disabled: true, detail: "Update bycoda on this computer for voice models." });
  f.cloud = { openai: true, xai: false };
  await act(async () => root.render(h(VoiceSettingsScreen)));
  expect(select("Dictation recognition").options[2]).toMatchObject({ disabled: false, detail: "Codex" });
  expect(select("Dictation recognition").options[3]).toMatchObject({ disabled: true, detail: "Needs setup on the computer" });
  expect(container.textContent).not.toContain("Live voice on desktop");
  expect(select("Voice").options.map(option => option.label)).toEqual(["Male 1", "Female 1", "High quality (VoxCPM2)", "ElevenLabs"]);
  expect(select("Voice").options[0]).toMatchObject({ value: "supertonic:M1", detail: "Natural (Supertonic)" });
});

it("keeps reply voice limited to available engines and saves turn taking on the phone", async () => {
  mount();
  f.cloud = { openai: true, xai: true, elevenlabs: false };
  await act(async () => root.render(h(VoiceChoices)));
  await act(async () => select("Voice").onChange("elevenlabs"));
  expect(f.persist).not.toHaveBeenCalled();
  await act(async () => select("Voice").onChange("voxcpm2"));
  expect(f.persist).toHaveBeenLastCalledWith({ speech: "voxcpm2" });
  await act(async () => select("Voice").onChange("supertonic:F1"));
  expect(f.persist).toHaveBeenLastCalledWith({ speech: "supertonic", speaker: "F1" });
  expect(select("Wait before replying").options.map(option => option.label)).toEqual(["Natural pause", "Longer pause", "Extra time"]);
  await act(async () => select("Wait before replying").onChange("2.5"));
  expect(f.persist).toHaveBeenLastCalledWith({ turnPause: 2.5 });
  await act(async () => f.toggles.get("I decide when my turn ends")!(true));
  expect(f.persist).toHaveBeenLastCalledWith({ manualTurnEnd: true });
  f.manual = true;
  await act(async () => root.render(h(VoiceChoices)));
  expect(select("Wait before replying").disabled).toBe(true);
});

it("waits for the computer before prompting for a voice-model update", async () => {
  const container = mount();
  f.disconnected = true;
  await act(async () => root.render(h(VoiceSettingsScreen)));
  expect(container.textContent).not.toContain("Update bycoda on this computer for voice models.");
  f.disconnected = false;
  await act(async () => root.render(h(VoiceSettingsScreen)));
  expect(container.textContent).toContain("Update bycoda on this computer for voice models.");
});

it("lists models in one group, removes from the row menu and refreshes when a removal settles before any poll", async () => {
  const container = mount();
  await act(async () => root.render(h(VoiceSettingsScreen)));
  expect(container.textContent).not.toContain("Whisper small: Installed on Office PC");
  await act(async () => button(container, "Transcription models").click());
  expect(container.textContent).toContain("Whisper small: Installed on Office PC");
  await act(async () => button(container, "Remove").click());
  expect(container.textContent).toContain("Remove Whisper small from Office PC?");
  // The Host finishes the removal before the phone ever reads a working job.
  f.job = { state: "ready", id: "small", action: "delete" };
  await act(async () => container.querySelector<HTMLButtonElement>("[data-confirm]")!.click());
  expect(f.action).toHaveBeenCalledWith({ action: "delete", id: "small" });
  expect(f.modelsRefetch).toHaveBeenCalledOnce();
  f.installed = false;
  await act(async () => root.render(h(VoiceSettingsScreen)));
  await act(async () => button(container, "Download").click());
  expect(f.action).toHaveBeenLastCalledWith({ action: "download", id: "small" });
});

it("commits the voice ID when the field is left, holds a draft per pairing and rejects stale engine callbacks", async () => {
  const container = mount();
  f.cloud = { elevenlabs: true, openai: true };
  f.eleven = true;
  await act(async () => root.render(h(VoiceSettingsScreen)));
  await act(async () => f.draft!("OfficeDraft"));
  const oldChoice = () => select("Dictation recognition").onChange("openai");
  const staleChoice = select("Dictation recognition").onChange;
  let release!: () => void;
  f.beforePatch = new Promise<void>(resolve => { release = resolve; });
  oldChoice();
  Object.assign(f, { scope: "laptop-1", pairing: "laptop", computer: "Laptop" });
  await act(async () => {
    release();
    root.render(h(VoiceSettingsScreen));
  });
  expect(container.querySelector("input")?.value).toBe("SavedVoice");
  expect(f.persist).not.toHaveBeenCalled();
  Object.assign(f, { scope: "office-2", pairing: "office", computer: "Office PC" });
  f.beforePatch = undefined;
  await act(async () => root.render(h(VoiceSettingsScreen)));
  expect(container.querySelector("input")?.value).toBe("OfficeDraft");
  await act(async () => staleChoice("openai"));
  expect(f.persist).not.toHaveBeenCalled();
  await act(async () => f.blur!());
  expect(f.persist).toHaveBeenCalledExactlyOnceWith({ elevenVoice: "OfficeDraft" });
});

it("retires a model removal confirmation when the same saved row is re-paired", async () => {
  const container = mount();
  await act(async () => root.render(h(VoiceSettingsScreen)));
  await act(async () => button(container, "Transcription models").click());
  await act(async () => button(container, "Remove").click());
  const retired = f.confirm!;
  expect(container.querySelector("[data-confirm]")).not.toBeNull();
  Object.assign(f, { scope: "laptop-1", pairing: "laptop", computer: "Laptop" });
  await act(async () => root.render(h(VoiceSettingsScreen)));
  expect(container.querySelector("[data-confirm]")).toBeNull();
  await act(async () => retired());
  expect(f.action).not.toHaveBeenCalled();
});

it("offers one storage retry in the call settings and on the Voice assistant page", async () => {
  const container = mount();
  f.preferenceError = { operation: "save" };
  const retries = () => [...container.querySelectorAll("button")].filter((item) => item.textContent === "Retry");
  await act(async () => root.render(h(VoiceChoices)));
  expect(retries()).toHaveLength(1);
  f.retryPreferences.mockRejectedValueOnce(new Error("storage unavailable"));
  await act(async () => {
    retries()[0].click();
    retries()[0].click();
  });
  expect(f.retryPreferences).toHaveBeenCalledOnce();
  await act(async () => retries()[0].click());
  expect(f.retryPreferences).toHaveBeenCalledTimes(2);
  await act(async () => root.render(h(VoiceSettingsScreen)));
  expect(retries()).toHaveLength(1);
});
