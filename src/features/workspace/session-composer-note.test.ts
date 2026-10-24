// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SessionComposer } from "./session-composer";
import { emptyComposerDraft, type ComposerDraft } from "./composer-draft";
import type { ComposerTransfer } from "./composer-transfer-model";

const state = vi.hoisted(() => ({ activeId: "machine", supported: true, browserSupported: false, stageBrowser: vi.fn(), removeStaged: vi.fn(), draft: null as ComposerDraft | null,
  receiver: null as null | ((request: ComposerTransfer) => void), renderDraft: null as null | (() => void),
  onCommand: vi.fn(async () => undefined), persist: vi.fn(async () => undefined), enqueue: vi.fn(),
  register: (receiver: (request: ComposerTransfer) => void) => { state.receiver = receiver; return () => { state.receiver = null; }; },
}));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children), useWindowDimensions: () => ({ height: 800, fontScale: 1 }) }));
vi.mock("lucide-react-native/icons/arrow-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/image", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/file", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "request" }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => null }));
vi.mock("@/ui/tokens", () => ({ colors: {}, metrics: { touchTarget: 48 }, space: { sm: 8, xs: 4 } }));
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
vi.mock("./use-session-queue", () => ({ useSessionQueue: () => ({ supported: true, enqueue: state.enqueue }) }));
vi.mock("./session-queue", () => ({ SessionQueue: () => null }));
vi.mock("@/features/management/templates/template-library", () => ({ TemplateLibrary: () => null }));
vi.mock("@/features/management/templates/template-store", () => ({ useTemplateHydration: () => null, useTemplates: { getState: () => ({ hydrated: false }) } }));
vi.mock("./shared", () => ({ ErrorText: () => null }));
vi.mock("@/ui/chat-controls", () => {
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { ChatCircleAction: Button, ChatToolbarAction: Button };
});
vi.mock("@/ui/chat-composer", () => ({ ChatComposer: ({ value, submit, mode }: { value: string; submit: ReactNode; mode: ReactNode }) => createElement("div", null, createElement("textarea", { value, readOnly: true }), mode, submit) }));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Wrap, Stack: Wrap, Row: Wrap, NavigationGroup: Wrap,
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
afterEach(async () => { await act(async () => root?.unmount()); state.draft = null; state.supported = true; state.browserSupported = false; state.activeId = "machine"; state.receiver = null; state.stageBrowser.mockReset(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
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
