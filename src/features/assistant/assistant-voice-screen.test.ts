// @vitest-environment happy-dom
import { act, createElement as h, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ mute: vi.fn(), dismiss: vi.fn(), end: vi.fn(), minimize: vi.fn(), orb: vi.fn(), backdrop: vi.fn(), silence: vi.fn(), speaker: vi.fn(), finish: vi.fn(), manual: false }));
vi.mock("react-native", () => ({ Keyboard: { dismiss: f.dismiss }, StyleSheet: { hairlineWidth: 1 }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  View: ({ children, style }: PropsWithChildren<{ style: unknown }>) => h("div", { "data-style": JSON.stringify(style) }, children),
  ScrollView: ({ children }: PropsWithChildren) => h("section", null, children),
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 0 }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string>) => en.replace(/\{(\w+)\}/g, (_m, key: string) => values?.[key] ?? "") }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/scope-line", () => ({ ScopePills: ({ scope }: { scope: { computer?: string; project?: string } }) => h("span", { "data-scope-pills": true }, [scope.computer, scope.project].filter(Boolean).join(" · ")) }));
vi.mock("@/ui/primitives", () => {
  const Body = ({ children }: PropsWithChildren) => h("p", null, children);
  const Button = ({ label, onPress, disabled, expanded, children }: PropsWithChildren<any>) => h("button", { "aria-label": label, "aria-expanded": expanded, disabled, onClick: onPress }, children);
  return { Body, Button, IconButton: Button, HeaderBackButton: ({ onPress }: { onPress(): void }) => h("button", { "aria-label": "Back", onClick: onPress }), Notice: ({ message, action }: { message: string; action?: { label: string; onPress(): void } }) => h("div", { role: "alert" }, h("p", null, message), action ? h("button", { "aria-label": action.label, onClick: action.onPress }, action.label) : null), Disclosure: ({ children, label }: PropsWithChildren<{ label: string }>) => h("details", null, h("summary", null, label), children) };
});
vi.mock("@/ui/layout", () => ({ fitsHeaderRow: () => true }));
vi.mock("lucide-react-native/icons/square", () => ({ default: () => null }));
vi.mock("@/ui/busy-indicator", () => ({ BusyIndicator: () => h("i", { "data-busy": true }) }));
vi.mock("../voice-settings/call-voice-button", () => ({ AssistantSettingsButton: () => h("button", { "aria-label": "Voice settings" }) }));
vi.mock("@/ui/call-control",() => ({ CallControl: ({ label, accessibilityLabel, onPress, disabled, selected }: PropsWithChildren<any>) =>
  h("button", { "aria-label": accessibilityLabel ?? label, "aria-pressed": !!selected, disabled, onClick: onPress }, label) }));
vi.mock("./assistant-call-session", () => ({ muteAssistantCall: f.mute, silenceAssistantCall: f.silence, setAssistantCallSpeakerMuted: f.speaker, finishAssistantCallTurn: f.finish }));
vi.mock("./assistant-voice-stage", () => ({
  AssistantVoiceOrb: (props: unknown) => { f.orb(props); return null; },
  AssistantVoiceBackdrop: (props: unknown) => { f.backdrop(props); return null; },
}));
vi.mock("lucide-react-native/icons/audio-lines", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/skip-forward", () => ({ default: () => null }));
vi.mock("../voice-settings/voice-preferences", () => ({ useVoicePreferences: () => ({ preferences: { manualTurnEnd: f.manual } }) }));
vi.mock("lucide-react-native/icons/send", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/volume-2", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/volume-x", () => ({ default: () => null }));
vi.mock("../workspace/session-keyboard-frame", () => ({ SessionKeyboardFrame: ({ children, composer }: PropsWithChildren<{ composer: React.ReactNode }>) => h("main", null, children, h("footer", null, composer)) }));
vi.mock("lucide-react-native/icons/mic", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/keyboard", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/keyboard-off", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/mic-off", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/message-square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/phone-off", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/rotate-ccw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-left", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/minimize-2", () => ({ default: () => null }));
import { AssistantVoiceScreen } from "./assistant-voice-screen";
import { useAssistantCall } from "./assistant-call-state";
import { AssistantCallError } from "./assistant-call-error";
let root: ReturnType<typeof createRoot>;
function Screen({ active = true }: { active?: boolean }) {
  const [visible, setVisible] = useState(false), [draft, setDraft] = useState("Unsent draft");
  return h(AssistantVoiceScreen, { active, name: "Ada", computer: "Office PC", scope: { computer: "Office PC", project: "Project" }, transcriptVisible: visible, pending: false, ready: true,
    onToggleTranscript: () => setVisible(!visible), onStart: vi.fn(), onMinimize: f.minimize, onEnd: f.end,
    composer: h("input", { value: draft, onChange: event => setDraft(event.target.value) }),
  }, h("article", null, "Live transcript"));
}
function mount() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"); root = createRoot(container); return container; }
it("keeps the call failure visible with the transcript open", async () => {
  const container = mount();
  await act(async () => root.render(h(Screen)));
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show chat"]')!.click());
  await act(async () => useAssistantCall.setState({ phase: "idle", error: new Error("Speech playback timed out.") }));
  expect(container.textContent).toContain("Voice call unavailable");
  expect(container.textContent).toContain("Speech playback timed out.");
});
it("names the failed step and the computer that runs transcription", async () => {
  const container = mount();
  // While the computer loads its model nothing is recorded: no "speak now" hint and no Send now.
  await act(async () => useAssistantCall.setState({ phase: "listening", capture: "preparing", stage: "transcription" }));
  await act(async () => root.render(h(Screen)));
  expect(container.textContent).toContain("Getting Office PC ready…");
  expect(container.textContent).not.toContain("Speak naturally");
  expect(container.querySelector('[aria-label="Send what you said now"]')).toBeNull();
  await act(async () => useAssistantCall.setState({ capture: "transcribing" }));
  expect(container.textContent).toContain("Transcription on Office PC");
  await act(async () => useAssistantCall.setState({ phase: "idle", stage: "transcription", error: new Error("Model file missing") }));
  expect(container.textContent).toContain("Your speech couldn't be transcribed");
  // Unknown app text is never shown raw; the owner reads one localized line under the named step.
  expect(container.textContent).not.toContain("Model file missing"); expect(container.textContent).toContain("Voice didn't work. Try again.");
  await act(async () => useAssistantCall.setState({ stage: "playback" }));
  expect(container.textContent).toContain("The reply couldn't play on this phone");
});
afterEach(async () => { await act(async () => root?.unmount()); useAssistantCall.setState({ phase: "idle", muted: false, error: undefined, stage: undefined, capture: undefined, level: 0, spokenInterrupt: undefined }); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("keeps transcript and composer mounted through hide/show and voice/text changes", async () => {
  const container = mount(); useAssistantCall.setState({ phase: "listening", level: 0.7 });
  await act(async () => root.render(h(Screen)));
  const input = container.querySelector("input"), transcript = container.querySelector("article");
  expect(JSON.parse(transcript!.parentElement!.getAttribute("data-style")!).display).toBe("none");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show chat"]')!.click());
  expect(JSON.parse(transcript!.parentElement!.getAttribute("data-style")!).display).toBe("flex");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Hide chat"]')!.click());
  expect(f.dismiss).toHaveBeenCalledOnce(); expect(container.querySelector("input")).toBe(input);
  await act(async () => root.render(h(Screen, { active: false })));
  expect(container.querySelector("input")).toBe(input); expect(input?.value).toBe("Unsent draft");
  expect(container.querySelector("article")).toBe(transcript);
});
// The dock wrapped "Speaker off" and clipped "Send now", a button the owner could not place: a pause
// already sends, so the dock is Mute, Speaker and End, with short labels and no pictures.
it("exposes the call controls and measured stage state, without an unexplained Send", async () => {
  const container = mount(); useAssistantCall.setState({ phase: "listening", capture: "recording", level: 0.7 });
  await act(async () => root.render(h(Screen)));
  expect([...container.querySelectorAll("button")].map(button => button.getAttribute("aria-label"))).toEqual([
    "Minimize assistant", "Voice settings", "Show chat", "Mute microphone", "Mute speaker", "End voice call"]);
  // The visible labels are short and say what each control is.
  expect(container.textContent).toContain("Microphone"); expect(container.textContent).toContain("Speaker"); expect(container.textContent).not.toContain("Send");
  expect(f.orb).toHaveBeenLastCalledWith(expect.objectContaining({ state: "listening", level: 0.7 }));
  expect(f.backdrop).toHaveBeenLastCalledWith({ state: "listening" });
  f.backdrop.mockClear();
  await act(async () => useAssistantCall.setState({ level: 0.4 }));
  expect(f.orb).toHaveBeenLastCalledWith(expect.objectContaining({ state: "listening", level: 0.4 }));
  expect(f.backdrop).not.toHaveBeenCalled();
  expect(container.querySelector("[data-owner]")).toBeNull(); expect(container.querySelector("[data-avatar]")).toBeNull();
  // Level 0.7 is sound on the microphone: said in words, not only by the orb.
  expect(container.textContent).toContain("Microphone is receiving sound");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Mute microphone"]')!.click()); expect(f.mute).toHaveBeenCalledWith(true);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Mute speaker"]')!.click()); expect(f.speaker).toHaveBeenCalledWith(true);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Minimize assistant"]')!.click()); expect(f.minimize).toHaveBeenCalledOnce();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="End voice call"]')!.click()); expect(f.end).toHaveBeenCalledOnce();
  expect(container.textContent).not.toMatch(/settings|provider|persona/i);
});
it("shows the assistant's turn and lets Silence stop a spoken reply", async () => {
  const container = mount(); useAssistantCall.setState({ phase: "speaking", lastReply: "Here is the plan." });
  await act(async () => root.render(h(Screen)));
  expect(container.querySelector("[data-owner]")).toBeNull();
  expect(container.textContent).toContain("Here is the plan.");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Stop the reply and listen again"]')!.click());
  expect(f.silence).toHaveBeenCalledOnce();
});
it("shows a connecting state from the tap until the call listens, with End available", async () => {
  const container = mount(); useAssistantCall.setState({ phase: "starting" });
  await act(async () => root.render(h(Screen)));
  expect(container.textContent).toContain("Connecting…"); expect(container.textContent).not.toContain("Waiting for reply");
  expect(container.querySelector("[data-busy]")).not.toBeNull();
  expect(f.orb).toHaveBeenLastCalledWith(expect.objectContaining({ state: "thinking" }));
  // Connecting offers only Cancel, as on the desktop; nothing can be muted yet.
  expect(container.querySelector('[aria-label="Mute microphone"]')).toBeNull();
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Cancel voice call"]')!.disabled).toBeFalsy();
  await act(async () => useAssistantCall.setState({ phase: "listening" }));
  expect(container.textContent).toContain("Listening"); expect(container.querySelector("[data-busy]")).toBeNull();
});
it("puts the home on the call's calm stage before any call", async () => {
  const container = mount(); useAssistantCall.setState({ phase: "idle" });
  await act(async () => root.render(h(AssistantVoiceScreen, { active: false, stage: true, name: "Ada", computer: "Office PC", scope: { computer: "Office PC" }, transcriptVisible: false, pending: false, ready: true,
    scopeControl: h("span", { "data-conversation-scope": true }, "Global"),
    actions: h("button", { "aria-label": "Recent conversations" }),
    onToggleTranscript: vi.fn(), onStart: vi.fn(), onMinimize: vi.fn(), onEnd: vi.fn(), composer: null })));
  expect(f.backdrop).toHaveBeenLastCalledWith({ state: "idle" });
  // The home draws its own bar over the light: Back, the name and conversations; no call controls before a call.
  expect([...container.querySelectorAll("button")].map(button => button.getAttribute("aria-label"))).toEqual(["Back", "Recent conversations"]);
  expect(container.textContent).toContain("Ada");
  // The computer stays a read-only pill; the conversation's own scope follows it in the same row.
  expect(container.querySelector("[data-scope-pills]")?.textContent).toBe("Office PC");
  expect(container.querySelector("[data-conversation-scope]")?.textContent).toBe("Global");
});
it("keeps mute and failure states explicit and permits a deliberate restart", async () => {
  const container = mount(); useAssistantCall.setState({ phase: "speaking", muted: true });
  await act(async () => root.render(h(Screen)));
  expect(container.textContent).toContain("Speaking");
  expect(container.querySelector('[aria-label="Unmute microphone"]')).not.toBeNull();
  await act(async () => useAssistantCall.setState({ phase: "muted" }));
  expect(container.textContent).toContain("Connected · Microphone off");
  await act(async () => useAssistantCall.setState({ phase: "idle", muted: false, error: new Error("Some raw English failure") }));
  expect(container.textContent).toContain("Call stopped"); expect(container.textContent).not.toContain("Some raw English failure"); expect(container.textContent).toContain("Voice didn't work. Try again.");
  // A stopped call offers one way back in and Back; the toggles of a call that is not running are gone.
  expect(container.querySelector('[aria-label="Try again"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Mute microphone"]')).toBeNull();
  expect(container.querySelector('[aria-label="End voice call"]')).toBeNull();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Back"]')!.click()); expect(f.end).toHaveBeenCalledOnce();
});
// Three minutes of silence used to end the call with "Call stopped" and an error card.
it("sleeps with one Talk button after the idle limit and reconnects a dropped line without an error", async () => {
  const container = mount(); useAssistantCall.setState({ phase: "idle", error: undefined, asleep: true });
  await act(async () => root.render(h(Screen)));
  expect(container.textContent).toContain("Paused after silence"); expect(container.textContent).toContain("Tap Talk to continue.");
  expect(container.textContent).not.toContain("Call stopped");
  expect([...container.querySelectorAll("button")].map(button => button.getAttribute("aria-label"))).toEqual(["Back", "Voice settings", "Show chat", "Talk"]);
  await act(async () => useAssistantCall.setState({ asleep: undefined, reconnecting: 2 }));
  expect(container.textContent).toContain("Reconnecting…");
  expect(f.orb).toHaveBeenLastCalledWith(expect.objectContaining({ state: "thinking" }));
  expect(container.querySelector('[aria-label="Mute microphone"]')).toBeNull();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Stop reconnecting"]')!.click()); expect(f.end).toHaveBeenCalledOnce();
  await act(async () => useAssistantCall.setState({ reconnecting: undefined }));
});
it("offers Send only with the manual turn end, also with the chat open", async () => {
  const container = mount(); f.manual = true;
  try {
    useAssistantCall.setState({ phase: "listening", capture: "recording", level: 0, muted: false, error: undefined });
    await act(async () => root.render(h(Screen)));
    expect(container.textContent).toContain("Tap Send when you are done.");
    expect(container.textContent).toContain("Send");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show chat"]')!.click());
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Send what you said now"]')!.click());
    expect(f.finish).toHaveBeenCalledOnce();
  } finally { f.manual = false; }
});
// QA Host stopped a call with "check the previous message" and offered no way to reach it.
it("opens the conversation from a failure that asks to check the previous message", async () => {
  const container = mount();
  await act(async () => root.render(h(Screen)));
  await act(async () => useAssistantCall.setState({ phase: "idle", stage: "connect", error: new AssistantCallError("send-unreviewed") }));
  const show = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Show chat"]')];
  expect(show).toHaveLength(2);
  await act(async () => show[1].click());
  expect(container.querySelector('[aria-label="Hide chat"]')).not.toBeNull();
});
// The owner could not tell what "Transcription" meant nor change the assistant's voice from the call.
it("keeps settings beside the chat toggle throughout the call", async () => {
  const container = mount();
  await act(async () => root.render(h(Screen)));
  await act(async () => useAssistantCall.setState({ phase: "listening", error: undefined }));
  expect(container.querySelector('[aria-label="Voice settings"]')?.nextElementSibling?.getAttribute("aria-label")).toBe("Show chat");
  await act(async () => useAssistantCall.setState({ phase: "idle", error: new Error("stopped") }));
  expect(container.querySelector('[aria-label="Voice settings"]')).not.toBeNull();
  await act(async () => root.render(h(Screen, { active: false })));
  expect(container.querySelector('[aria-label="Voice settings"]')).toBeNull();
});
// Every call opened in the compact layout once the chat had been shown, with a composer competing for the
// stage. The composer opens only from Write in the dock, and a stopped call offers only Try again.
it("keeps the composer closed until Write, and hides it when the call stops", async () => {
  const container = mount(); useAssistantCall.setState({ phase: "listening", capture: "recording", error: undefined });
  function Writable() {
    const [writing, setWriting] = useState(false);
    return h(AssistantVoiceScreen, { active: true, name: "Ada", computer: "Office PC", scope: {}, transcriptVisible: false, composerVisible: writing, pending: false, ready: true,
      onToggleComposer: () => setWriting(!writing), onToggleTranscript: vi.fn(), onStart: vi.fn(), onMinimize: vi.fn(), onEnd: vi.fn(),
      composer: h("input", { "data-composer": true }) }, h("article", null, "Live transcript"));
  }
  await act(async () => root.render(h(Writable)));
  const composerShown = () => JSON.parse(container.querySelector("[data-composer]")!.parentElement!.getAttribute("data-style")!).display !== "none";
  const transcriptShown = () => JSON.parse(container.querySelector("article")!.parentElement!.getAttribute("data-style")!).display !== "none";
  expect([...container.querySelectorAll("footer button")].map(button => button.textContent)).toEqual(["Microphone", "Write", "Speaker", "End"]);
  // A realtime call relayed by an older computer takes no typed turns: Write is not offered there.
  await act(async () => useAssistantCall.setState({ typingUnavailable: true }));
  expect([...container.querySelectorAll("footer button")].map(button => button.textContent)).toEqual(["Microphone", "Speaker", "End"]);
  await act(async () => useAssistantCall.setState({ typingUnavailable: undefined }));
  expect(composerShown()).toBe(false); expect(transcriptShown()).toBe(false);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Write a message"]')!.click());
  // Write opens the composer above the dock, not the transcript.
  expect(composerShown()).toBe(true); expect(transcriptShown()).toBe(false);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close the message field"]')!.click());
  expect(f.dismiss).toHaveBeenCalledOnce(); expect(composerShown()).toBe(false);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Write a message"]')!.click());
  await act(async () => useAssistantCall.setState({ phase: "idle", error: new Error("stopped") }));
  expect(composerShown()).toBe(false);
  expect([...container.querySelectorAll("footer button")].map(button => button.getAttribute("aria-label"))).toEqual(["Try again"]);
  expect(container.textContent).toContain("Call stopped");
});
it("keeps the owner's last words under a stopped call", async () => {
  const container = mount(); useAssistantCall.setState({ phase: "sending", utterance: "Open the release notes", error: undefined });
  await act(async () => root.render(h(Screen)));
  await act(async () => useAssistantCall.setState({ phase: "idle", utterance: undefined, error: new Error("stopped") }));
  expect(container.textContent).toContain("“Open the release notes”");
  expect(f.orb).toHaveBeenLastCalledWith(expect.objectContaining({ state: "error" }));
});

it("says quietly that only a tap interrupts during a realtime call without spoken interruption", async () => {
  const hint = "Tap to interrupt.";
  const container = mount();
  await act(async () => useAssistantCall.setState({ phase: "listening", capture: undefined, spokenInterrupt: true }));
  await act(async () => root.render(h(Screen)));
  expect(container.textContent).not.toContain(hint);
  await act(async () => useAssistantCall.setState({ spokenInterrupt: false }));
  expect(container.textContent).toContain(hint);
  await act(async () => useAssistantCall.setState({ phase: "speaking", lastReply: "Two sessions are running." }));
  expect(container.textContent).toContain(hint);
  // Beside the small orb with the chat open, too.
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show chat"]')!.click());
  expect(container.textContent).toContain(hint);
  // Not on a stopped call, and never on a call that does not report it.
  await act(async () => useAssistantCall.setState({ phase: "idle", error: new Error("Stopped") }));
  expect(container.textContent).not.toContain(hint);
  await act(async () => useAssistantCall.setState({ phase: "listening", error: undefined, spokenInterrupt: undefined }));
  expect(container.textContent).not.toContain(hint);
});
