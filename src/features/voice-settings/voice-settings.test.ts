// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { VoicePreferences } from "./voice-preferences";
const f = vi.hoisted(() => ({
  installed: true, disconnected: false, job: { state: "idle" } as Record<string, unknown>,
  cloud: undefined as Record<string, boolean> | undefined,
  modelsRefetch: vi.fn(), action: vi.fn(async () => ({})),
  scope: "office-1", pairing: "office", computer: "Office PC",
  eleven: false, draft: undefined as undefined | ((value: string) => void),
  confirm: undefined as undefined | (() => void),
  choice: undefined as undefined | (() => void), persist: vi.fn(), beforePatch: undefined as undefined | Promise<void>,
  chooseSpeech: undefined as undefined | ((value: string) => void),
  preferenceError: null as { operation: "save" } | null, retryPreferences: vi.fn(async () => {}),
}));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("./microphone-priority", () => ({ MicrophonePriority: () => null }));
vi.mock("lucide-react-native/icons/chevron-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/audio-lines", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string>) => en.replace(/\{(\w+)\}/g, (_m, key: string) => values?.[key] ?? "") }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestCloseThen: (next: () => void) => next() }) }));
vi.mock("@/ui/tokens", () => ({ space: {} }));
vi.mock("../settings/local-data-sizes", () => ({ formatBytes: (value: number) => `${value} B` }));
vi.mock("./voice-preferences", () => ({
  useVoicePreferences: () => ({ preferences: { engine: "local", micOrder: [], ...(f.eleven ? { speech: "elevenlabs", elevenVoice: "SavedVoice" } : {}) }, hydrated: true,
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
  return { useActiveMachine: () => ({ ...machine, name: f.computer }), useMachines: (select: (value: typeof state) => unknown) => select(state) };
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
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => h("div", null, children);
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress(): void }) => h("button", { onClick: onPress, disabled }, label);
  return {
    Body: Group, Button, IconButton: Group, Stack: Group, NavigationGroup: Group, SectionHeader: ({ title }: { title: string }) => h("h2", null, title),
    Notice: ({ message, onRetry }: { message: string; onRetry?: () => void }) => h("div", null, message,
      onRetry ? h(Button, { label: "Retry", onPress: onRetry }) : null), ErrorNotice: () => null, QueryState: () => null,
    SettingIcon: () => null, SegmentedRow: () => null,
    SelectField: ({ label, onChange }: { label: string; onChange(value: string): void }) => {
      if (label === "Assistant's voice") f.chooseSpeech = onChange;
      return h("p", null, label);
    },
    SelectRow: ({ label, detail, disabled, onPress }: { label: string; detail?: string; disabled?: boolean; onPress(): void }) => {
      if (label === "OpenAI") f.choice = onPress;
      return h("p", { "data-choice": label, "aria-disabled": disabled }, label, detail);
    },
    Input: ({ value, onChangeText }: { value: string; onChangeText(value: string): void }) => {
      f.draft = onChangeText;
      return h("input", { value, readOnly: true });
    },
    ChoiceChip: ({ label }: { label: string }) => h("span", null, label),
    NavigationRow: ({ label, detail, onPress }: { label: string; detail: string; onPress(): void }) => h("button", { onClick: onPress }, label, detail),
    Sheet: ({ visible, children }: PropsWithChildren<{ visible: boolean }>) => (visible ? h("section", null, children) : null),
    ValueRow: ({ label, value }: { label: string; value: string }) => h("div", null, `${label}: ${value}`),
    ConfirmationCard: ({ confirmLabel, onConfirm, message }: { confirmLabel: string; onConfirm(): void; message: string }) => {
      f.confirm = onConfirm;
      return h("div", null, message, h("button", { onClick: onConfirm, "data-confirm": true }, confirmLabel));
    },
  };
});
import { VoiceSettings } from "./voice-settings";
import { VoiceChoices } from "./voice-choices";
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  await act(async () => root?.unmount()); vi.unstubAllGlobals(); vi.clearAllMocks();
  Object.assign(f, { installed: true, job: { state: "idle" }, cloud: undefined, scope: "office-1", pairing: "office",
    computer: "Office PC", eleven: false, draft: undefined, confirm: undefined, choice: undefined, chooseSpeech: undefined, beforePatch: undefined, preferenceError: null });
});

it("shows which computer update or account setup the transcription choice needs", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  f.cloud = { openrouter: true };
  await act(async () => root.render(h(VoiceSettings)));
  await act(async () => container.querySelector("button")!.click());
  const find = (label: string) => container.querySelector(`[data-choice="${label}"]`)!;
  expect(find("OpenAI").getAttribute("aria-disabled")).toBe("true");
  expect(find("OpenAI").textContent).toContain("Update bycoda on this computer for voice models.");
  f.cloud = { openai: true, xai: false };
  await act(async () => root.render(h(VoiceSettings)));
  expect(find("OpenAI").getAttribute("aria-disabled")).toBe("false");
  expect(find("OpenAI").textContent).toContain("Codex");
  expect(find("Grok").getAttribute("aria-disabled")).toBe("true");
  expect(find("Grok").textContent).toContain("Needs setup on the computer");
  expect(container.textContent).toContain("Live voice on desktop: OpenAI Realtime");
  expect(container.textContent).not.toContain("Grok Voice");
});

it("keeps TTS selection limited to supported engines while naming desktop conversation modes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  f.cloud = { openai: true, xai: true, elevenlabs: false };
  await act(async () => root.render(h(VoiceChoices)));
  expect(container.textContent).toContain("OpenAI Realtime · Grok Voice");
  await act(async () => f.chooseSpeech?.("elevenlabs"));
  expect(f.persist).not.toHaveBeenCalled();
  await act(async () => f.chooseSpeech?.("voxcpm2"));
  expect(f.persist).toHaveBeenCalledExactlyOnceWith({ speech: "voxcpm2" });
});

it("waits for the computer before prompting for a voice-model update", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  f.disconnected = true;
  try {
    await act(async () => root.render(h(VoiceSettings)));
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).not.toContain("Update bycoda on this computer for voice models.");
    f.disconnected = false;
    await act(async () => root.render(h(VoiceSettings)));
    expect(container.textContent).toContain("Update bycoda on this computer for voice models.");
  } finally {
    f.disconnected = false;
  }
});

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

it("holds an unsaved voice ID for its original pairing and rejects stale engine callbacks", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  f.cloud = { elevenlabs: true, openai: true };
  f.eleven = true;
  await act(async () => root.render(h(VoiceSettings)));
  await act(async () => container.querySelector("button")!.click());
  await act(async () => f.draft!("OfficeDraft"));
  const oldChoice = f.choice!;
  let release!: () => void;
  f.beforePatch = new Promise<void>(resolve => { release = resolve; });
  oldChoice();
  Object.assign(f, { scope: "laptop-1", pairing: "laptop", computer: "Laptop" });
  await act(async () => {
    release();
    root.render(h(VoiceSettings));
  });
  expect(container.querySelector("input")?.value).toBe("SavedVoice");
  expect(f.persist).not.toHaveBeenCalled();
  Object.assign(f, { scope: "office-2", pairing: "office", computer: "Office PC" });
  await act(async () => root.render(h(VoiceSettings)));
  expect(container.querySelector("input")?.value).toBe("OfficeDraft");
  await act(async () => oldChoice());
  expect(f.persist).not.toHaveBeenCalled();
});

it("retires a model removal confirmation when the same saved row is re-paired", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  await act(async () => root.render(h(VoiceSettings)));
  await act(async () => container.querySelector("button")!.click());
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Remove")!.click());
  const retired = f.confirm!;
  expect(container.querySelector("[data-confirm]")).not.toBeNull();
  Object.assign(f, { scope: "laptop-1", pairing: "laptop", computer: "Laptop" });
  await act(async () => root.render(h(VoiceSettings)));
  expect(container.querySelector("[data-confirm]")).toBeNull();
  await act(async () => retired());
  expect(f.action).not.toHaveBeenCalled();
});

it("offers one storage retry in the call settings and the full Voice settings", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  f.preferenceError = { operation: "save" };
  const retries = () => [...container.querySelectorAll("button")].filter((button) => button.textContent === "Retry");
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
  await act(async () => root.render(h(VoiceSettings)));
  await act(async () => container.querySelector("button")!.click());
  expect(retries()).toHaveLength(1);
});
