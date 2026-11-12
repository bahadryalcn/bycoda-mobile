// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SessionComposer } from "./session-composer";
import { emptyComposerDraft, type ComposerDraft } from "./composer-draft";
import type { ComposerTransfer } from "./composer-transfer-model";

const state = vi.hoisted(() => ({ activeId: "machine", supported: true, browserSupported: false, stageBrowser: vi.fn(), removeStaged: vi.fn(), draft: null as ComposerDraft | null,
  templateInsert: null as null | ((body: string) => void),
  selection: { start: 0, end: 0 }, select: null as null | ((selection: { start: number; end: number }) => void),
  receiver: null as null | ((request: ComposerTransfer) => void), renderDraft: null as null | (() => void),
  onCommand: vi.fn(async () => undefined), persist: vi.fn(async () => undefined), enqueue: vi.fn(), pause: vi.fn(async () => undefined),
  register: (receiver: (request: ComposerTransfer) => void) => { state.receiver = receiver; return () => { state.receiver = null; }; },
}));
vi.mock("./composer-model-chip", () => ({ ComposerModelChip: () => null }));
vi.mock("./composer-mode-controls", () => ({ ComposerModeMenu: () => null, DeliveryModeButton: () => null }));
vi.mock("lucide-react-native/icons/send", () => ({ default: () => null }));
vi.mock("expo-image",() => ({ Image: () => null }));
vi.mock("./composer-links", () => ({ ComposerLinks: () => null }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children), useWindowDimensions: () => ({ height: 800, fontScale: 1 }) }));
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
vi.mock("@/ui/icon-tile", () => ({ IconTile: ({ children }: PropsWithChildren) => children }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "request" }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/tokens", async () => ({ ...await vi.importActual<typeof import("@/ui/tokens")>("@/ui/tokens"), colors: {} }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
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
    return { ready: true, isStored: true, persist: state.persist, load: vi.fn(), setValue, valueRef, value: state.draft, error: null };
  } };
});
vi.mock("./composer-transfer", () => ({ useComposerTransfer: () => ({ register: state.register }) }));
vi.mock("./draft-guard", () => ({ registerWorkspaceDraft: () => () => {} }));
vi.mock("./session-keyboard-frame", async () => ({ SessionKeyboardSpace: (await import("react")).createContext(null) }));
vi.mock("./use-composer-catalog", () => ({ useComposerCatalog: () => ({ data: [] }) }));
vi.mock("./composer-suggestions", () => ({ ComposerSuggestions: () => null }));
vi.mock("./composer-attachments", () => ({ ComposerAttachments: () => null }));
vi.mock("./attachment-files", () => ({ pickAttachments: vi.fn(), removeStagedFile: state.removeStaged, stageBrowserCapture: state.stageBrowser }));
vi.mock("./attachment-transfer", () => ({ uploadAttachment: vi.fn() }));
vi.mock("./attachment-ownership", () => ({ composerDraftKey: () => "key", supportsAttachmentOwnership: () => state.browserSupported,
  attachmentReleases: { stage: vi.fn(async () => undefined), flush: vi.fn(async () => undefined) } }));
vi.mock("./use-session-queue", () => ({ useSessionQueue: () => ({ supported: true, enqueue: state.enqueue, pause: state.pause }) }));
vi.mock("./session-queue", () => ({ SessionQueue: () => null }));
vi.mock("@/features/management/templates/template-library", () => ({ TemplateLibrary: ({ onInsert }: { onInsert: (body: string) => void }) => {
  state.templateInsert = onInsert;
  return createElement("p", null, "Template panel");
} }));
vi.mock("@/features/management/templates/template-store", () => ({ useTemplateHydration: () => null, useTemplates: { getState: () => ({ hydrated: false }) } }));
vi.mock("./shared", () => ({ ErrorText: () => null }));
vi.mock("@/ui/chat-controls", () => {
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { ChatCircleAction: Button, ChatToolbarAction: Button, ChatAction: Button };
});
vi.mock("@/ui/chat-composer", () => ({ ChatComposer: ({ value, submit, mode, leading, field, top }: {
  value: string; submit: ReactNode; mode: ReactNode; leading: ReactNode; top?: ReactNode;
  field: { selection: { start: number; end: number }; onSelectionChange: (event: unknown) => void };
}) => {
  state.selection = field.selection;
  state.select = (selection) => field.onSelectionChange({ nativeEvent: { selection } });
  return createElement("div", null, top, createElement("textarea", { value, readOnly: true }), leading, mode, submit);
} }));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { ErrorNotice: () => null, Body: Wrap, Stack: Wrap, Row: Wrap, NavigationGroup: Wrap,
    Sheet: ({ children, visible }: PropsWithChildren<{ visible: boolean }>) => visible ? createElement("div", null, children) : null,
    Button: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label),
    NavigationRow: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
  };
});
const note = { id: "note-1", slug: "reviewed", title: "Reviewed note", body: "Complete source body\n" };
const props = { scope: { machineId: "machine", sessionId: "session" }, session: { projectId: "project", status: "idle",
  session: { id: "session", harness: "codex", model: "codex:test", blocks: [] } }, blocked: false, busy: false, onCommand: state.onCommand };
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
async function mount() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container); await act(async () => root.render(createElement(SessionComposer, props as never))); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
afterEach(async () => { await act(async () => root?.unmount()); state.draft = null; state.supported = true; state.browserSupported = false; state.activeId = "machine"; state.receiver = null; state.templateInsert = null; state.select = null; state.stageBrowser.mockReset(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("reports refused template insertion without changing the composer draft or selection, then inserts only at the retained selection", async () => {
  const original = { ...emptyComposerDraft(), text: "x".repeat(256_000), noteCard: note };
  state.draft = original; await mount();
  await act(async () => state.select!({ start: 3, end: 5 }));
  await click("Add to message"); await click("Phone templates");
  expect(() => state.templateInsert!("too long")).toThrow("The message is too long.");
  expect(state.draft).toBe(original); expect(state.selection).toEqual({ start: 3, end: 5 });
  expect(container.textContent).toContain("Template panel");
  state.activeId = "other";
  expect(() => state.templateInsert!("ok")).toThrow("This conversation is not available for insertion. Your draft is unchanged.");
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

it("shows a direct Stop while a run is active and cancels that exact run after pausing the queue", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container);
  const running = { ...props, session: { ...props.session, status: "running", runId: "run-1" } };
  await act(async () => root.render(createElement(SessionComposer, running as never)));
  expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Send")).toBe(false);
  await click("Stop");
  expect(state.pause).toHaveBeenCalledTimes(1);
  expect(state.onCommand).toHaveBeenCalledWith(expect.objectContaining({ type: "cancel", runId: "run-1", sessionId: "session" }));
});
