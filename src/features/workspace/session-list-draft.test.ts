// @vitest-environment happy-dom
import { act, createElement as h, type ComponentProps, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SessionListRow } from "./session-list-row";
import { DraftStore } from "./draft-store";
import { composerDraftKey } from "./attachment-ownership";
import { decodeComposerDraft, encodeComposerDraft, emptyComposerDraft, type ComposerDraft } from "./composer-draft";
import { withDraftStorageCleanup } from "@/state/local-draft-storage";
import { useSecurity } from "@/state/security";

const disk = vi.hoisted(() => {
  const values = new Map<string, string>();
  return { values, getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { values.delete(key); }) };
});
vi.mock("@react-native-async-storage/async-storage", () => ({ default: disk }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
vi.mock("@/state/security", () => ({ useSecurity: create(() => ({ status: "unlocked" })) }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children), useWindowDimensions: () => ({ width: 320, height: 700, fontScale: 1 }) }));
vi.mock("lucide-react-native/icons/git-branch", () => ({ default: () => null }));
vi.mock("@/ui/primitives", () => ({ Body: ({ children }: PropsWithChildren) => h("span", null, children),
  PressableCard: ({ children, label }: PropsWithChildren<{ label: string }>) => h("button", { "aria-label": label }, children), StatusText: ({ label }: { label: string }) => h("span", null, label) }));
vi.mock("@/ui/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/ui/provider-identity", () => ({ ProviderIcon: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/tokens", () => ({ metrics: {}, space: {} }));
vi.mock("./shared", () => ({ relativeTime: () => "1m", sessionStatus: () => ({ label: "Ready" }) }));
vi.mock("./session-row-actions", () => ({ SessionRowActions: ({ children }: { children(open: () => void): unknown }) => children(() => {}) }));

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let props: ComponentProps<typeof SessionListRow>;
let sequence = 0;
const allow = () => true;
const deny = () => false;
const key = () => composerDraftKey(props.machineId, props.session.id);
const store = () => new DraftStore(disk, key(), decodeComposerDraft, encodeComposerDraft);
async function render(extra: Partial<typeof props> = {}) {
  props = { ...props, ...extra };
  await act(async () => root.render(h(SessionListRow, props)));
}
const marked = () => container.querySelector("button")?.getAttribute("aria-label")?.includes("Draft") ?? false;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useSecurity.setState({ status: "unlocked" });
  disk.values.clear(); vi.clearAllMocks();
  container = document.createElement("div"); root = createRoot(container);
  props = { machineId: `draft-test-${++sequence}`, projectId: "project", canRead: allow, onPress: () => {},
    session: { id: "session", projectId: "project", revision: 1, title: "Review", harness: "codex", status: "idle", updatedAt: 1 } };
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it("renders Host draft state, clears it on authoritative update and conceals it when locked", async () => {
  await render({ session: { ...props.session, draft: true } });
  expect(marked()).toBe(true);
  expect(container.textContent).toContain("Draft");
  await act(async () => useSecurity.setState({ status: "locked" }));
  expect(marked()).toBe(false);
  await act(async () => useSecurity.setState({ status: "unlocked" }));
  expect(marked()).toBe(true);
  await render({ session: { ...props.session, draft: false } });
  expect(marked()).toBe(false);
});

it("updates the mounted memoized row only after a successful save and clear", async () => {
  await render(); expect(marked()).toBe(false);
  const draft = store(); await act(async () => draft.load());
  disk.setItem.mockRejectedValueOnce(new Error("disk full"));
  await act(async () => { await expect(draft.persist({ ...emptyComposerDraft(), text: "unsaved" })).rejects.toThrow("disk full"); });
  expect(marked()).toBe(false);
  await act(async () => draft.persist({ ...emptyComposerDraft(), text: "saved" }));
  expect(marked()).toBe(true);
  await act(async () => draft.persist(null)); expect(marked()).toBe(false);
});

const attachment = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "diagram.png", mimeType: "image/png", size: 128, kind: "image" as const, uri: "file:///draft/diagram.png" };
const noteCard = { id: "note", slug: "review", title: "Review", body: "Retained note", sourceCwd: "/project" };
for (const [name, draft] of [
  ["attachment", { ...emptyComposerDraft(), attachments: [attachment] }],
  ["note", { ...emptyComposerDraft(), noteCard }],
  ["retained queue intent", { ...emptyComposerDraft(), queueIntent: { id: "intent", contentDigest: "0".repeat(64) } }],
] as [string, ComposerDraft][]) {
  it(`hydrates a persisted ${name}-only draft without repeated reads`, async () => {
    disk.values.set(key(), encodeComposerDraft(draft)!);
    await render(); expect(marked()).toBe(true);
    await render(); expect(disk.getItem).toHaveBeenCalledTimes(1);
    await render({ machineId: props.machineId + "-other" }); expect(marked()).toBe(false);
  });
}
it("does not read denied or locked rows and removes cached presence on cleanup", async () => {
  disk.values.set(key(), "saved draft");
  await render({ canRead: deny }); expect(disk.getItem).not.toHaveBeenCalled(); expect(marked()).toBe(false);
  await act(async () => useSecurity.setState({ status: "locked" }));
  await render({ canRead: allow }); expect(disk.getItem).not.toHaveBeenCalled();
  await act(async () => useSecurity.setState({ status: "unlocked" })); expect(marked()).toBe(true);
  await act(async () => withDraftStorageCleanup(disk, async retire => { disk.values.clear(); retire(new Set()); }));
  expect(marked()).toBe(false);
});
