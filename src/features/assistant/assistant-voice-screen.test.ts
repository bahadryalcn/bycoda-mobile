// @vitest-environment happy-dom
import { act, createElement as h, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ mute: vi.fn(), dismiss: vi.fn(), end: vi.fn(), minimize: vi.fn(), orb: vi.fn(), backdrop: vi.fn(), silence: vi.fn(), speaker: vi.fn(), finish: vi.fn() }));
vi.mock("react-native", () => ({ Keyboard: { dismiss: f.dismiss }, useWindowDimensions: () => ({ width: 390, height: 844 }),
  View: ({ children, style }: PropsWithChildren<{ style: unknown }>) => h("div", { "data-style": JSON.stringify(style) }, children),
  ScrollView: ({ children }: PropsWithChildren) => h("section", null, children),
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 0 }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/primitives", () => {
  const Body = ({ children }: PropsWithChildren) => h("p", null, children);
  const Button = ({ label, onPress, disabled, expanded, children }: PropsWithChildren<any>) => h("button", { "aria-label": label, "aria-expanded": expanded, disabled, onClick: onPress }, children);
  return { Body, Button, IconButton: Button, Disclosure: ({ children, label }: PropsWithChildren<{ label: string }>) => h("details", null, h("summary", null, label), children) };
});
vi.mock("@/ui/busy-indicator", () => ({ BusyIndicator: () => h("i", { "data-busy": true }) }));
vi.mock("@/ui/call-control",() => ({ CallControl: ({ label, accessibilityLabel, onPress, disabled, selected }: PropsWithChildren<any>) =>
  h("button", { "aria-label": accessibilityLabel ?? label, "aria-pressed": !!selected, disabled, onClick: onPress }, label) }));
vi.mock("./assistant-call-session", () => ({ muteAssistantCall: f.mute, silenceAssistantCall: f.silence, setAssistantCallSpeakerMuted: f.speaker, finishAssistantCallTurn: f.finish }));
vi.mock("./assistant-voice-stage", () => ({
  AssistantVoiceOrb: (props: unknown) => { f.orb(props); return null; },
  AssistantVoiceBackdrop: (props: unknown) => { f.backdrop(props); return null; },
}));
vi.mock("./assistant-avatar", () => ({ AssistantAvatar: ({ value }: { value?: string }) => h("i", { "data-avatar": value }) }));
vi.mock("./assistant-owner-avatar", () => ({ useAssistantOwner: () => ({ initial: "B" }), AssistantOwnerAvatar: () => h("i", { "data-owner": true }) }));
vi.mock("lucide-react-native/icons/audio-lines", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pause", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/send", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/volume-2", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/volume-x", () => ({ default: () => null }));
vi.mock("../workspace/session-keyboard-frame", () => ({ SessionKeyboardFrame: ({ children, composer }: PropsWithChildren<{ composer: React.ReactNode }>) => h("main", null, children, h("footer", null, composer)) }));
vi.mock("lucide-react-native/icons/mic", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/mic-off", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/message-square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/phone-off", () => ({ default: () => null }));
import { AssistantVoiceScreen } from "./assistant-voice-screen";
import { useAssistantCall } from "./assistant-call-state";
let root: ReturnType<typeof createRoot>;
function Screen({ active = true }: { active?: boolean }) {
  const [visible, setVisible] = useState(false), [draft, setDraft] = useState("Unsent draft");
  return h(AssistantVoiceScreen, { active, name: "Ada", scope: "Computer · Project", avatar: "🦊", transcriptVisible: visible, pending: false, ready: true,
    onToggleTranscript: () => setVisible(!visible), onStart: vi.fn(), onMinimize: f.minimize, onEnd: f.end,
    composer: h("input", { value: draft, onChange: event => setDraft(event.target.value) }),
  }, h("article", null, "Live transcript"));
}
function mount() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"); root = createRoot(container); return container; }
afterEach(async () => { await act(async () => root?.unmount()); useAssistantCall.setState({ phase: "idle", muted: false, error: undefined, level: 0 }); vi.clearAllMocks(); vi.unstubAllGlobals(); });
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
it("exposes the desktop call controls, the owner's turn and measured stage state without settings", async () => {
  const container = mount(); useAssistantCall.setState({ phase: "listening", level: 0.7 });
  await act(async () => root.render(h(Screen)));
  expect([...container.querySelectorAll("button")].map(button => button.getAttribute("aria-label"))).toEqual([
    "Minimize assistant", "Show chat", "Send now", "Mute microphone", "Stop the reply and listen again", "Mute speaker", "End voice call"]);
  expect(f.orb).toHaveBeenLastCalledWith(expect.objectContaining({ state: "listening", level: 0.7 }));
  expect(f.backdrop).toHaveBeenLastCalledWith(expect.objectContaining({ state: "listening", level: 0.7 }));
  expect(container.querySelector("[data-owner]")).not.toBeNull(); expect(container.querySelector('[data-avatar="🦊"]')).not.toBeNull();
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Stop the reply and listen again"]')!.disabled).toBe(true);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Send now"]')!.click()); expect(f.finish).toHaveBeenCalledOnce();
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
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Mute microphone"]')!.disabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="End voice call"]')!.disabled).toBeFalsy();
  await act(async () => useAssistantCall.setState({ phase: "listening" }));
  expect(container.textContent).toContain("Listening"); expect(container.querySelector("[data-busy]")).toBeNull();
});
it("puts the home on the call's calm stage before any call", async () => {
  mount(); useAssistantCall.setState({ phase: "idle" });
  await act(async () => root.render(h(AssistantVoiceScreen, { active: false, stage: true, name: "Ada", scope: "", transcriptVisible: false, pending: false, ready: true,
    onToggleTranscript: vi.fn(), onStart: vi.fn(), onMinimize: vi.fn(), onEnd: vi.fn(), composer: null })));
  expect(f.backdrop).toHaveBeenLastCalledWith(expect.objectContaining({ state: "idle", level: 0 }));
});
it("keeps mute and failure states explicit and permits a deliberate restart", async () => {
  const container = mount(); useAssistantCall.setState({ phase: "speaking", muted: true });
  await act(async () => root.render(h(Screen)));
  expect(container.textContent).toContain("Microphone muted");
  await act(async () => useAssistantCall.setState({ phase: "idle", muted: false, error: new Error("Microphone permission required") }));
  expect(container.textContent).toContain("Call stopped"); expect(container.textContent).toContain("Microphone permission required");
  expect(container.querySelector('[aria-label="Voice call"]')).not.toBeNull();
});
