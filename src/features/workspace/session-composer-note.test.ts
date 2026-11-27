// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SessionComposer } from "./session-composer";
import { SessionKeyboardSpace } from "./session-keyboard-frame";
import { emptyComposerDraft, type ComposerDraft } from "./composer-draft";
import type { ComposerTransfer } from "./composer-transfer-model";
vi.mock("../../../modules/bycoda-key-commands", () => ({ useKeyCommand: () => null }));
vi.mock("expo-router/react-navigation", () => ({ useIsFocused: () => true }));
vi.mock("@/features/keyboard/keyboard-preferences", () => ({
  useKeyboardPreferenceHydration: () => null,
  useKeyboardPreferences: (select: (state: unknown) => unknown) => select({ hydrated: true, enterSends: true }),
}));
vi.mock("@/features/account/ui/account-context", () => ({ useAccount: () => ({ status: "signedIn", device: { id: "account" } }) }));
vi.mock("../outbox/runtime/store", () => ({ sendOutbox: { read: async () => [] } }));
vi.mock("../outbox/runtime/custody", () => ({ cleanOutboxFiles: async () => {} }));

const state = vi.hoisted(() => ({ activeId: "machine", supported: true, browserSupported: false, stageBrowser: vi.fn(), removeStaged: vi.fn(), draft: null as ComposerDraft | null,
  templateInsert: null as null | ((body: string) => void), draftReady: true,
  selection: { start: 0, end: 0 }, select: null as null | ((selection: { start: number; end: number }) => void),
  keyboard: {} as Record<string, () => void>, focusField: () => {}, blurField: () => {},
  receiver: null as null | ((request: ComposerTransfer) => void), renderDraft: null as null | (() => void),
  onCommand: vi.fn(async () => undefined), persist: vi.fn(async () => undefined), enqueue: vi.fn(), pause: vi.fn(async () => undefined), dismissKeyboard: vi.fn(),
  register: (receiver: (request: ComposerTransfer) => void) => { state.receiver = receiver; return () => { state.receiver = null; }; },
}));
vi.mock("./composer-model-chip", () => ({ ComposerModelChip: () => null }));
vi.mock("./composer-mode-controls", () => ({
  ComposerModeChip: ({ onRemove }: { onRemove: () => void }) => createElement("button", { onClick: onRemove }, "Turn off mode"),
}));
vi.mock("./composer-context-meter", () => ({ ComposerContextRing: () => null, contextNeedsAttention: () => false }));
vi.mock("lucide-react-native/icons/send", () => ({ default: () => null }));
vi.mock("expo-image",() => ({ Image: () => null }));
vi.mock("./composer-links", () => ({ ComposerLinks: () => null }));
vi.mock("./use-dictation", () => ({ useDictation: () => ({ view: {}, error: null, phase: "idle", toggle: () => {}, clearError: () => {} }) }));
vi.mock("./composer-dictation", () => ({ ComposerDictationButton: () => null }));
vi.mock("./composer-recording", () => ({ ComposerDictationNotice: () => null, ComposerRecordingRow: () => null }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: state.dismissKeyboard, addListener: (name: string, listener: () => void) => { state.keyboard[name] = listener; return { remove: () => undefined }; } },
  View: ({ children, style }: PropsWithChildren<{ style?: { display?: "none" } }>) =>
    createElement("div", { hidden: style?.display === "none" }, children),
  ScrollView: ({ children, style, keyboardShouldPersistTaps }: PropsWithChildren<{
    style: { maxHeight: number }; keyboardShouldPersistTaps: string;
  }>) => createElement("div", { "data-prefix-height": style.maxHeight, "data-keep-taps": keyboardShouldPersistTaps }, children),
  useWindowDimensions: () => ({ height: 800, fontScale: 1 }),
}));
vi.mock("lucide-react-native/icons/arrow-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/corner-down-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/list-plus", () => ({ default: () => null }));
vi.mock("@/ui/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/state/busy-send", () => ({ useBusySend: () => "steer" }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/image", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/file", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/layout-template", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/clipboard-list", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-dashed", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/lightbulb", () => ({ default: () => null }));
vi.mock("@/ui/icon-tile", () => ({ IconTile: ({ children }: PropsWithChildren) => children }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "request" }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/tokens", async () => ({ ...await vi.importActual<typeof import("@/ui/tokens")>("@/ui/tokens"), colors: {} }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn(), select: vi.fn(), tap: vi.fn() } }));
vi.mock("@/state/queries", () => ({ useHostClient: () => ({ machine: { id: "machine", capabilities: [...(state.supported ? ["sessions.noteContext.v1"] : []), ...(state.browserSupported ? ["browser.annotation", "attachments.ownership.v1"] : [])] } }) }));
vi.mock("@/state/machines", () => ({ useMachines: { getState: () => ({ activeId: state.activeId, machines: [] }) } }));
vi.mock("./use-local-draft", async () => {
  const { useReducer, useRef, useCallback } = await import("react");
  return { useLocalDraft: () => {
    const [, render] = useReducer((value: number) => value + 1, 0);
    const valueRef = useRef(state.draft); valueRef.current = state.draft;
    state.renderDraft = render;
    const setValue = useCallback((update: ComposerDraft | null | ((draft: ComposerDraft | null) => ComposerDraft | null)) => {
      state.draft = typeof update === "function" ? update(state.draft) : update;
      valueRef.current = state.draft; render();
    }, []);
    return { ready: state.draftReady, isStored: true, persist: state.persist, load: vi.fn(), setValue, valueRef, value: state.draft, error: null };
  } };
});
vi.mock("./composer-transfer", () => ({ useComposerTransfer: () => ({ register: state.register }) }));
vi.mock("./draft-guard", () => ({ registerWorkspaceDraft: () => () => {} }));
vi.mock("./session-keyboard-frame", async () => ({ SessionKeyboardSpace: (await import("react")).createContext(null) }));
vi.mock("./use-composer-catalog", () => ({ useComposerCatalog: () => ({ data: [] }) }));
vi.mock("./composer-suggestions", () => ({ ComposerSuggestions: () => null }));
vi.mock("./composer-attachments", () => ({ ComposerAttachments: ({ files }: { files: { id: string; name: string }[] }) =>
  files.map((file) => createElement("span", { key: file.id }, file.name)) }));
vi.mock("./attachment-files", () => ({ pickAttachments: vi.fn(), removeStagedFile: state.removeStaged, stageBrowserCapture: state.stageBrowser }));
vi.mock("./attachment-transfer", () => ({ uploadAttachment: vi.fn() }));
vi.mock("./attachment-ownership", () => ({ composerDraftKey: () => "key", supportsAttachmentOwnership: () => state.browserSupported,
  attachmentReleases: { stage: vi.fn(async () => undefined), flush: vi.fn(async () => undefined) } }));
vi.mock("./use-session-queue", () => ({ useSessionQueue: () => ({ supported: true, enqueue: state.enqueue, pause: state.pause }) }));
vi.mock("./session-queue", () => ({ SessionQueue: () => null }));
vi.mock("./session-parent-bar", () => ({ SessionParentBar: () => null }));
vi.mock("./session-agents", () => ({ SessionAgents: ({ children }: { children: (controls: ReactNode) => ReactNode }) =>
  children(createElement("button", { "data-agent-controls": true }, "Agents")) }));
vi.mock("@/features/management/templates/template-library", () => ({ TemplateLibrary: ({ onInsert }: { onInsert: (body: string) => void }) => {
  state.templateInsert = onInsert;
  return createElement("p", null, "Template panel");
} }));
vi.mock("@/features/management/templates/template-store", () => ({ useTemplateHydration: () => null, useTemplates: { getState: () => ({ hydrated: false }) } }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => null }));
vi.mock("./shared", () => ({ ErrorText: () => null }));
vi.mock("@/ui/overflow-menu", () => ({ RowOptionsSheet: () => null }));
vi.mock("@/ui/anchored-menu", () => ({ AnchoredMenu: () => null }));
vi.mock("@/ui/chat-controls", () => {
  const Button = ({ label, hint, disabled, onPress }: { label: string; hint?: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress, title: hint }, label);
  return { ChatCircleAction: Button, ChatToolbarAction: Button, ChatAction: Button };
});
vi.mock("@/ui/chat-composer", () => ({ ChatComposer: ({ value, submit, leading, inlineLeading, field, top }: {
  value: string; submit: ReactNode; leading: ReactNode; top?: ReactNode;
  inlineLeading?: ReactNode;
  field: { selection: { start: number; end: number }; onSelectionChange: (event: unknown) => void; onFocus: () => void; onBlur: () => void };
}) => {
  state.focusField = field.onFocus;
  state.blurField = field.onBlur;
  state.selection = field.selection;
  state.select = (selection) => field.onSelectionChange({ nativeEvent: { selection } });
  return createElement("div", null, top, inlineLeading, createElement("textarea", { value, readOnly: true }), leading, submit);
} }));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { ErrorNotice: ({ error, message, onRetry }: { error?: Error; message?: string; onRetry?: () => void }) =>
    error ? createElement("p", { "data-has-retry": !!onRetry }, message ?? error.message) : null,
    Body: Wrap, Stack: Wrap, Row: Wrap, NavigationGroup: Wrap, SectionHeader: () => null,
    Sheet: ({ children, visible }: PropsWithChildren<{ visible: boolean }>) => visible ? createElement("div", null, children) : null,
    Button: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label),
    NavigationRow: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label),
    RowIcon: () => null,
  };
});
const note = { id: "note-1", slug: "reviewed", title: "Reviewed note", body: "Complete source body\n" };
const props = { scope: { machineId: "machine", sessionId: "session" }, session: { projectId: "project", status: "idle",
  session: { id: "session", harness: "codex", model: "codex:test", blocks: [] } }, blocked: false, busy: false, onCommand: state.onCommand };
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
async function mount(availableHeight: number | null = null) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () => root.render(createElement(SessionKeyboardSpace.Provider, { value: availableHeight },
    createElement(SessionComposer, props as never))));
}
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
afterEach(async () => { await act(async () => root?.unmount()); state.draft = null; state.supported = true; state.browserSupported = false; state.activeId = "machine"; state.receiver = null; state.templateInsert = null; state.select = null; state.stageBrowser.mockReset(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("opens a restored draft at its end and preserves a deliberate selection on keyboard resize", async () => {
  state.draftReady = false;
  try {
    await mount();
    await act(async () => state.select?.({ start: 0, end: 0 }));

    const text = "Recovered draft 🙂";
    state.draft = { ...emptyComposerDraft(), text };
    state.draftReady = true;
    await act(async () => state.renderDraft?.());
    expect(container.querySelector("textarea")?.value).toBe(text);
    expect(state.selection).toEqual({ start: text.length, end: text.length });

    const selected = { start: 2, end: 6 };
    await act(async () => state.select?.(selected));
    await act(async () => root.render(createElement(SessionKeyboardSpace.Provider, { value: 130 },
      createElement(SessionComposer, props as never))));
    expect(container.querySelector("textarea")?.value).toBe(text);
    expect(state.selection).toEqual(selected);
    expect(state.onCommand).not.toHaveBeenCalled();
    expect(state.enqueue).not.toHaveBeenCalled();
  } finally {
    state.draftReady = true;
  }
});

it("keeps all twenty files in the bounded draft prefix and leaves the editor and Send outside it", async () => {
  const attachments = Array.from({ length: 20 }, (_, index) => ({
    id: `file-${index}`, uri: `file:///staged/${index}.txt`, name: `Draft file ${index + 1}`,
    size: 12, mimeType: "text/plain", kind: "file" as const,
  }));
  const original = { ...emptyComposerDraft(), text: "Draft text", attachments, noteCard: note };
  state.draft = original;
  await mount();

  const prefix = container.querySelector<HTMLElement>("[data-prefix-height]")!;
  expect(Number(prefix.dataset.prefixHeight)).toBeLessThan(200);
  expect(prefix.dataset.keepTaps).toBe("handled");
  expect(prefix.textContent).toContain("Draft file 20");
  expect(prefix.textContent).toContain("Reviewed note");
  expect(prefix.querySelector("textarea")).toBeNull();
  expect([...prefix.querySelectorAll("button")].some((button) => button.textContent === "Send")).toBe(false);
  expect(container.querySelector("textarea")?.value).toBe("Draft text");
  expect(state.draft).toBe(original);
  expect(state.onCommand).not.toHaveBeenCalled();
});

it("keeps draft details reachable from Add to message when the inline area is too short", async () => {
  state.draft = { ...emptyComposerDraft(), text: "Draft text", noteCard: note };
  await mount(130);
  expect(container.querySelector("[data-prefix-height]")).toBeNull();
  expect(container.querySelector("textarea")?.value).toBe("Draft text");
  await click("Add to message");
  await click("Draft contents");
  expect(container.textContent).toContain("Reviewed note");
  await click("Remove note context");
  expect(container.textContent).toContain("No content yet");
  expect(state.draft?.text).toBe("Draft text");
  expect(state.onCommand).not.toHaveBeenCalled();
});

it("explains why Send is disabled when a compact draft hides the conflicting mode and note", async () => {
  const attachments = [{ id: "file", uri: "file:///staged/checklist.txt", name: "Checklist", size: 12, mimeType: "text/plain", kind: "file" as const }];
  const original = { ...emptyComposerDraft(), text: "/plan Draft text", noteCard: note, attachments };
  state.draft = original;
  await mount(130);
  await act(async () => state.select!({ start: original.text.length, end: original.text.length }));
  const send = () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Send");
  expect(container.querySelector("[data-prefix-height]")).toBeNull();
  expect(send()?.disabled).toBe(true);
  expect(container.querySelector("[data-agent-controls]")?.closest("[hidden]")).not.toBeNull();
  expect(container.querySelector('[data-has-retry="false"]')?.textContent).toContain("Turn off Plan mode");
  expect(state.draft).toBe(original);

  const review = [...container.querySelectorAll("button")].find((button) => button.textContent === "Review draft");
  expect(review?.title).toContain("Turn off Plan mode");
  await click("Review draft");
  expect(state.dismissKeyboard).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("Reviewed note");
  expect(container.textContent).toContain("Turn off Plan mode");
  await click("Turn off mode");
  expect(container.querySelector('[data-has-retry="false"]')).toBeNull();
  expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Review draft")).toBe(false);
  expect(send()?.disabled).toBe(false);
  expect(state.draft).toMatchObject({ text: "Draft text", noteCard: note, attachments });
  expect(state.onCommand).not.toHaveBeenCalled();
});

it("reports refused template insertion without changing the composer draft or selection, then inserts only at the retained selection", async () => {
  const original = { ...emptyComposerDraft(), text: "x".repeat(256_000), noteCard: note };
  state.draft = original; await mount();
  await act(async () => state.select!({ start: 3, end: 5 }));
  await click("Add to message"); await click("Templates");
  expect(() => state.templateInsert!("too long")).toThrow("The message is too long.");
  expect(state.draft).toBe(original); expect(state.selection).toEqual({ start: 3, end: 5 });
  expect(container.textContent).toContain("Template panel");
  state.activeId = "other";
  expect(() => state.templateInsert!("ok")).toThrow("This session is not available for insertion. Your draft is unchanged.");
  expect(state.draft).toBe(original); expect(state.selection).toEqual({ start: 3, end: 5 });
  state.activeId = "machine";
  state.draft = { ...original, text: "ab cd" }; await act(async () => state.renderDraft!());
  await act(async () => state.templateInsert!("ok"));
  expect(state.draft?.text).toBe("ab ok"); expect(state.draft?.noteCard).toBe(original.noteCard);
  expect(state.draft?.attachments).toBe(original.attachments);
  expect(state.selection).toEqual({ start: 5, end: 5 });
  expect(state.onCommand).not.toHaveBeenCalled(); expect(state.enqueue).not.toHaveBeenCalled();
});
it("inserts through the existing draft owner, preserves prose/mentions and sends the exact snapshot only on Send", async () => {
  const mentions = [{ label: "src/file", path: "src/file" }];
  state.draft = { ...emptyComposerDraft(), text: "Owner prose", selectedMentionRefs: mentions };
  await mount();
  await act(async () => state.receiver!({ machineId: "machine", sessionId: "session", text: "", noteCard: note }));
  expect(state.draft?.text).toBe("Owner prose"); expect(state.draft?.selectedMentionRefs).toBe(mentions);
  expect(container.textContent).toContain("Reviewed note"); expect(state.onCommand).not.toHaveBeenCalled();
  await click("Send");
  expect(state.onCommand).toHaveBeenCalledExactlyOnceWith({ type: "send", sessionId: "session", text: "Owner prose", attachments: [], noteCard: note });
  expect(state.draft?.noteCard).toBeUndefined(); expect(state.draft?.text).toBe("");
});
it("preserves restored context on an old host and removes only the note when explicitly requested", async () => {
  state.supported = false;
  state.draft = { ...emptyComposerDraft(), text: "Preserved prose", noteCard: note };
  await mount();
  expect(container.textContent).toContain("Your draft is preserved");
  await click("Send"); expect(state.onCommand).not.toHaveBeenCalled(); expect(state.draft?.noteCard).toEqual(note);
  await click("Remove note context"); expect(state.draft?.text).toBe("Preserved prose");
  await click("Send"); expect(state.onCommand).toHaveBeenCalledExactlyOnceWith({ type: "send", sessionId: "session", text: "Preserved prose", attachments: [] });
});
it("refuses insertion after an active computer change without touching the draft", async () => {
  state.draft = { ...emptyComposerDraft(), text: "Original" };
  await mount(); state.activeId = "other";
  expect(() => state.receiver!({ machineId: "machine", sessionId: "session", text: "", noteCard: note })).toThrow(/unavailable/);
  expect(state.draft?.noteCard).toBeUndefined(); expect(state.draft?.text).toBe("Original");
});
const browserCapture = () => ({ id: "capture", projectId: "project", sessionId: "session", navigationId: "nav", capturedAt: "2026-10-22T00:00:00Z", pageUrl: "https://fixture.invalid",
  viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0 }, devicePixelRatio: 1, trust: "untrusted-page-data" as const, limitations: [],
  element: { tag: "button", text: "Page text", selector: "#fixture", path: "body > button", bounds: { x: 1, y: 2, width: 20, height: 30 }, center: { x: 11, y: 17 }, ancestry: [], computedStyle: {} },
  screenshot: { mimeType: "image/jpeg" as const, data: "YWJj", width: 1280, height: 720 } });
it("adds one structured browser snapshot through the sole draft owner without sending or replacing note/prose/mentions", async () => {
  state.browserSupported = true; const mentions = [{ label: "file", path: "file" }]; state.draft = { ...emptyComposerDraft(), text: "Owner prose", noteCard: note, selectedMentionRefs: mentions };
  const { screenshot: _screenshot, ...metadata } = browserCapture();
  state.stageBrowser.mockReturnValue({ id: "browser-file", name: "browser-element.jpg", kind: "image", mimeType: "image/jpeg", size: 3, uri: "file:///private/browser", browserAnnotation: { ...metadata, comment: "Owner comment" } });
  await mount(); const request = { machineId: "machine", sessionId: "session", text: "", browserCapture: { capture: browserCapture(), comment: "Owner comment", isCurrent: () => true } };
  await act(async () => state.receiver!(request));
  expect(state.draft?.text).toBe("Owner prose"); expect(state.draft?.noteCard).toEqual(note); expect(state.draft?.selectedMentionRefs).toBe(mentions);
  expect(state.draft?.attachments[0]?.browserAnnotation).toEqual({ ...metadata, comment: "Owner comment" }); expect(state.onCommand).not.toHaveBeenCalled();
  expect(() => state.receiver!(request)).toThrow(/cannot be added/); expect(state.stageBrowser).toHaveBeenCalledOnce();
});
it("removes the staged snapshot and preserves the previous draft when navigation changes before insertion", async () => {
  state.browserSupported = true; const original = { ...emptyComposerDraft(), text: "Original" }; state.draft = original;
  const staged = { id: "staged", uri: "file:///private/staged" }; state.stageBrowser.mockReturnValue(staged); await mount();
  const isCurrent = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
  expect(() => state.receiver!({ machineId: "machine", sessionId: "session", text: "", browserCapture: { capture: browserCapture(), comment: "", isCurrent } })).toThrow(/changed/);
  expect(state.removeStaged).toHaveBeenCalledExactlyOnceWith(staged); expect(state.draft).toBe(original); expect(state.onCommand).not.toHaveBeenCalled();
});
it("rejects wrong browser conversation/project or old host before staging a file", async () => {
  state.browserSupported = true; await mount();
  const request = { machineId: "machine", sessionId: "session", text: "", browserCapture: { capture: { ...browserCapture(), projectId: "other" }, comment: "", isCurrent: () => true } };
  expect(() => state.receiver!(request)).toThrow(/cannot be added/); state.browserSupported = false;
  expect(() => state.receiver!({ ...request, browserCapture: { ...request.browserCapture, capture: browserCapture() } })).toThrow(/cannot be added/);
  expect(state.stageBrowser).not.toHaveBeenCalled(); expect(state.draft).toBeNull();
});

it("keeps Send visible at rest and the same controls through focus and keyboard changes", async () => {
  await mount();
  const send = () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Send");
  expect(send()?.disabled).toBe(true);
  await act(async () => state.focusField());
  expect(send()?.disabled).toBe(true);
  await act(async () => state.blurField());
  expect(send()).toBeDefined();
  expect(state.keyboard.keyboardDidHide).toBeUndefined();
});

it("chooses Plan mode and Save as draft from Add to message and shows the blocked reason", async () => {
  state.draft = { ...emptyComposerDraft(), text: "Build it" };
  await mount();
  await click("Add to message");
  await click("Plan mode");
  expect(state.draft?.text).toBe("/plan Build it");
  expect(container.textContent).not.toContain("For this message");
  await click("Add to message");
  await click("Save as draft");
  expect(state.draft?.text).toBe("/draft Build it");
  expect(state.onCommand).not.toHaveBeenCalled();
});

it("shows a direct Stop while a run is active and cancels that exact run after pausing the queue", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container);
  const running = { ...props, session: { ...props.session, status: "running", runId: "run-1" } };
  await act(async () => root.render(createElement(SessionComposer, running as never)));
  expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Send")).toBe(false);
  await click("Stop");
  expect(state.pause).toHaveBeenCalledTimes(1);
  expect(state.onCommand).toHaveBeenCalledWith(expect.objectContaining({ type: "cancel", runId: "run-1", sessionId: "session" }));
});

it("keeps Stop recoverable: a cancel that never settles does not lock it, and the screen's wait holds it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container);
  const running = { ...props, session: { ...props.session, status: "running", runId: "run-1" } };
  // The Host never replies to the first cancel.
  state.onCommand.mockImplementationOnce(() => new Promise<undefined>(() => {}));
  await act(async () => root.render(createElement(SessionComposer, running as never)));
  await click("Stop");
  expect(state.onCommand).toHaveBeenCalledTimes(1);
  // The screen owns the wait: while it holds, the button reads Stopping and sends nothing.
  await act(async () => root.render(createElement(SessionComposer, { ...running, stopping: true } as never)));
  await click("Stopping");
  expect(state.onCommand).toHaveBeenCalledTimes(1);
  // Its bounded wait ended with the run still going: Stop sends the same exact-run cancel again.
  await act(async () => root.render(createElement(SessionComposer, { ...running, stopping: false } as never)));
  await click("Stop");
  expect(state.onCommand).toHaveBeenCalledTimes(2);
  expect(state.onCommand).toHaveBeenLastCalledWith(expect.objectContaining({ type: "cancel", runId: "run-1", sessionId: "session" }));
});
