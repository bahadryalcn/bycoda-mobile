// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PullRequestMetadata } from "./metadata";
const state = vi.hoisted(() => ({ error: null as Error | null, changes: new Map<string, (value: string) => void>(), confirms: [] as Array<() => void>, send: vi.fn() }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, _description: string, _apply: string, confirm: () => void) => state.confirms.push(confirm) }));
vi.mock("../../inbox/provider-queries", () => ({ useInboxRead: ({ action }: { action: string }) => ({
  error: state.error, isFetching: false, refetch: vi.fn(),
  data: action === "checks" ? { headOid: "a".repeat(40), checks: [{ name: "test", workflow: "CI", state: "fail" }] } : action === "reviewers" ? { reviewRequests: [{ login: "private-reviewer" }], latestReviews: [] } : { labels: [{ name: "private-label" }], available: [{ name: "bug" }], truncated: false },
}) }));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Stack: Wrap, Row: Wrap, Body: Wrap, Disclosure: Wrap,
    Badge: ({ label }: { label: string }) => createElement("span", null, label), StatusText: ({ label }: { label: string }) => createElement("span", null, label),
    QueryState: ({ query }: { query: { error?: Error } }) => createElement("span", null, query.error?.message),
    Field: ({ label, onChangeText }: { label: string; onChangeText: (value: string) => void }) => { state.changes.set(label, onChangeText); return null; },
    SelectField: ({ label, onChange }: { label: string; onChange: (value: string) => void }) => { state.changes.set(label, onChange); return null; },
    Button: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label),
  };
});
let root: ReturnType<typeof createRoot> | undefined, container: HTMLDivElement;
let disabled = false;
const input = { item: { provider: "github", kind: "pr", number: 1, repo: "owner/repo", projectPath: "/repo" } } as const;
async function render() { await act(async () => root!.render(createElement(PullRequestMetadata, { input, canRead: true, disabled, onCommand: state.send }))); }
async function mount() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); await render(); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === label)!.click()); }
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); root = undefined; disabled = false; state.error = null; state.changes.clear(); state.confirms = []; vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("shows checks and sends exact metadata mutation only after confirmation", async () => {
  await mount(); expect(container.textContent).toContain("Failed"); expect(container.textContent).toContain("a".repeat(40));
  await act(async () => state.changes.get("GitHub username")!("alice")); await click("Request review"); expect(state.send).not.toHaveBeenCalled();
  await act(async () => state.confirms[0]!());
  expect(state.send).toHaveBeenCalledWith({ action: "reviewers", input: { ...input, mode: "request", logins: ["alice"], confirm: "CHANGE_PR_REVIEWERS" } });
});
it("retires pending confirmations across permission loss and concealment", async () => {
  await mount(); await click("Remove reviewer"); const old = state.confirms[0]!;
  state.error = Object.assign(Error("Access revoked"), { kind: "auth" }); await render();
  expect(container.textContent).not.toContain("private-reviewer"); expect(container.textContent).not.toContain("private-label"); expect(container.textContent).not.toContain("a".repeat(40));
  state.error = null; await render(); await act(async () => old()); expect(state.send).not.toHaveBeenCalled();
  await click("Remove label"); const pending = state.confirms[1]!; disabled = true; await render(); disabled = false; await render();
  await act(async () => pending()); expect(state.send).not.toHaveBeenCalled();
});
