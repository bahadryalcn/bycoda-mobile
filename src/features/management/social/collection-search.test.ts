// @vitest-environment happy-dom
import { act, createElement, type ComponentType, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AccountsPanel } from "./accounts-panel";
import { DraftsPanel } from "./drafts-panel";
import { RulesPanel } from "./rules-panel";
import { JobsPanel } from "./jobs-panel";
import { ThreadsPanel } from "./threads-panel";

const fixture = vi.hoisted(() => ({
  search: undefined as undefined | ((value: string) => void),
  rows: [] as { id: string }[],
}));
vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (tr: string) => tr }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("react-native", () => ({ View: () => null }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("../shared/format", () => ({ stamp: () => "24 Ekim" }));
vi.mock("../shared/paged-rows", () => ({ PagedRows: ({ items }: { items: { id: string }[] }) => { fixture.rows = items; return null; } }));
vi.mock("./account-card", () => ({ AccountCard: () => null }));
vi.mock("./account-form", () => ({ AccountForm: () => null }));
vi.mock("./policy-settings", () => ({ SocialPolicySettings: () => null }));
vi.mock("./draft-editor", () => ({ DraftEditor: () => null }));
vi.mock("./rule-editor", () => ({ RuleEditor: () => null }));
vi.mock("./thread-editor", () => ({ ThreadEditor: () => null }));
vi.mock("./content-excerpt", () => ({ ContentExcerpt: () => null }));
vi.mock("@/ui/message-text", () => ({ MessageText: () => null }));
vi.mock("@/ui/record-card", () => ({ RecordCard: () => null }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: wrapper, Row: wrapper, Card: wrapper, Disclosure: wrapper, NavigationGroup: wrapper,
    Sheet: () => null, ActionMenu: () => null, SelectField: () => null, ErrorText: () => null, Badge: () => null, NavigationRow: () => null,
    SearchField: ({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) => { fixture.search = onChangeText; return createElement("output", null, value); },
    Notice: ({ children, message }: PropsWithChildren<{ message: string }>) => createElement("aside", null, message, children),
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
  };
});

let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); vi.unstubAllGlobals(); fixture.search = undefined; });

const source = () => ({
  accounts: [{ id: "account", name: "İZMİR", platform: "x", connected: true, grants: { p: ["draft"] } }],
  drafts: [{ id: "draft", accountId: "account", projectId: "p", kind: "reply", text: "Tasarım incelemesi", reviewReason: "İçeriği inceleyin", generation: { status: "completed" } },
    { id: "other-draft", accountId: "account", projectId: "other", text: "Tasarım incelemesi" }],
  rules: [{ id: "rule", accountId: "account", projectId: "p", name: "Kural", mode: "approval", trigger: "message", dailyLimit: 2, topics: ["Mimari"], pausedReason: "Yetki eksik" }],
  jobs: [{ id: "job", accountId: "account", projectIds: ["p"], status: "queued", scheduledAt: 2, payload: { text: "İçerik", recipientId: "recipient" }, error: "Bağlantı kesildi" }],
  threads: [{ id: "thread", accountId: "account", projectId: "p", contactId: "recipient", kind: "message", lastInboundAt: 2, events: [{ direction: "inbound", text: "İnceleme isteği" }] }],
  contacts: [{ id: "recipient", accountId: "account", name: "IŞIK", platformId: "recipient" }], profiles: [],
});

it.each([
  ["accounts", AccountsPanel, ["izmir", "bağlı", "x"], "account"],
  ["drafts", DraftsPanel, ["izmir", "tasarım incelemesi", "içeriği", "tamamlandı"], "draft"],
  ["rules", RulesPanel, ["izmir", "mimari", "yetki eksik", "onay iste"], "rule"],
  ["jobs", JobsPanel, ["izmir", "ışık", "sırada", "bağlantı", "24 ekim"], "job"],
  ["threads", ThreadsPanel, ["izmir", "ışık", "inceleme isteği", "proje adı"], "thread"],
] as const)("searches visible %s fields in app locale and clears without host actions", async (_name, Panel, terms, id) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  const state = source();
  const before = JSON.stringify(state);
  const run = vi.fn();
  const dispatch = vi.fn();
  const props = { state, projectId: "p", projects: [{ id: "p", name: "Proje adı" }], editor: { kind: "closed" }, action: {}, run, dispatch, closeEditor: vi.fn() };
  const Component = Panel as unknown as ComponentType<typeof props>;
  await act(async () => root.render(createElement(Component, props)));
  for (const term of terms) {
    act(() => fixture.search?.(term));
    expect(fixture.rows.map((item) => item.id)).toEqual([id]);
  }
  act(() => fixture.search?.("unmatched"));
  expect(fixture.rows).toEqual([]);
  expect(container.textContent).toContain("Eşleşen sonuç yok");
  const clear = [...container.querySelectorAll("button")].find((button) => button.textContent === "Aramayı temizle");
  expect(clear).toBeDefined();
  act(() => clear!.click());
  expect(fixture.rows.map((item) => item.id)).toEqual([id]);
  expect(container.textContent).not.toContain("Eşleşen sonuç yok");
  act(() => fixture.search?.("unmatched"));
  await act(async () => root.render(createElement(Component, { ...props, state: {
    ...state, accounts: [], drafts: [], rules: [], jobs: [], threads: [],
  } })));
  // A polling refresh can remove the last record while search remains active.
  // The parent's genuine-empty state must not be contradicted by a no-match notice.
  expect(container.textContent).not.toContain("Eşleşen sonuç yok");
  expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Aramayı temizle")).toBe(true);
  expect(JSON.stringify(state)).toBe(before);
  expect(run).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});
