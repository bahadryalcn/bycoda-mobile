// @vitest-environment happy-dom
import { act, createElement, type ComponentProps, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderInboxComment, ProviderInboxConversation } from "./provider-conversation";
import { DiffStats, PrFileRow, PrReviewHeader } from "./provider-pr-review-summary";

vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, params?: Record<string, string | number>) =>
  en.replace(/\{(\w+)\}/g, (key, name: string) => String(params?.[name] ?? key)) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: {}, colors: {}, semanticColors: { success: {}, danger: {} } }) }));
vi.mock("@/ui/use-delayed-visible", () => ({ useDelayedVisible: () => true }));
vi.mock("lucide-react-native/icons/file-minus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/file-pen", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/file-plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/file-symlink", () => ({ default: () => null }));
vi.mock("../management/shared/format", () => ({ stamp: () => "Today" }));
vi.mock("../management/shared/paged-rows", () => ({ PagedRows: () => null }));
vi.mock("@/ui/message-text", () => ({ MessageText: () => null }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children), Text: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Wrap, Heading: Wrap, StatusText: ({ label }: { label: string }) => createElement("span", null, label), Stack: Wrap, Row: Wrap, Section: Wrap, Disclosure: Wrap, QueryState: () => null,
    Badge: ({ label }: { label: string }) => createElement("span", null, label), RowIcon: () => null,
    SectionHeader: ({ title, count }: { title: string; count?: number }) => createElement("h2", null, title, count === undefined ? null : new Intl.NumberFormat("tr").format(count)),
    Sheet: ({children,visible}:PropsWithChildren<{visible:boolean}>)=>visible?createElement("aside",null,children):null,
    ScreenList: ({header,data,renderItem}:{header:ReactNode;data:unknown[];renderItem:(row:{item:unknown})=>ReactNode})=>
      createElement("section",{"data-row-count":data.length},header,...data.map((item,index)=>createElement("article",{key:index},renderItem({item})))),
    NavigationRow: ({ label, detail, trailing, supporting, accessibilityLabel }: { label: string; detail?: string; trailing?: ReactNode; supporting?: ReactNode; accessibilityLabel?: string }) => createElement("div", { "aria-label": accessibilityLabel }, label, detail, supporting, trailing),
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label) };
});

let root: ReturnType<typeof createRoot> | undefined;
let node: HTMLDivElement;
async function render(element: Parameters<ReturnType<typeof createRoot>["render"]>[0]) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  await act(async () => root!.render(element));
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; node?.remove(); vi.unstubAllGlobals(); });

it.each([1, 1284])("counts %s replies as independent conversation rows", async count => {
  const comment: ComponentProps<typeof ProviderInboxComment>["comment"] = {
    id: "thread-parent", kind: "comment", url: "https://example.test/comments/parent", resolved: false, author: "Aleksandra Wiśniewska-Kowalczyk", body: "Review the original issue.", createdAt: "2026-11-13T00:00:00Z",
    replies: Array.from({ length: count }, (_, index) => ({ id: `comment-${index}`, kind: "comment", url: `https://example.test/comments/${index}`, resolved: false, author: "Jo", body: "Retain the draft.", createdAt: "2026-11-13T00:00:00Z", replies: [] })),
  };
  await render(createElement(ProviderInboxConversation, { thread:{data:{comments:[comment],truncated:false}}, provider: "github", onReply: vi.fn(), disabled:false }));
  expect(node.querySelector("[data-row-count]")?.getAttribute("data-row-count")).toBe(String(count+1));
  expect(node.querySelector("h2")?.textContent).toContain(new Intl.NumberFormat("tr").format(count+1));
  expect(node.querySelector("article")?.textContent).not.toContain("Jo");
});

it("formats diff counts while retaining exact item and file identity", async () => {
  const item: ComponentProps<typeof PrReviewHeader>["item"] = { provider: "github", kind: "pr", repo: "northwind/mobile", number: 1284, title: "Keep project draft recovery", projectPath: "/northwind/mobile", url: "https://example.test/pr/1284", state: "OPEN", draft: false, labels: [], assignees: [], updatedAt: "2026-11-13T00:00:00Z" };
  const context = { commitId: "a".repeat(40), headOid: "a".repeat(40), additions: 1284, deletions: 2345, files: [{ path: "src/draft-1284.ts", additions: 1284, deletions: 2345 }], patch: "", truncated: false };
  await render(createElement("div", null,
    createElement(PrReviewHeader, { item, context }),
    createElement(DiffStats, { additions: context.additions, deletions: context.deletions }),
    createElement(PrFileRow, { file: { path: "src/draft-1284.ts", status: "renamed", previousPath: "src/old.ts", additions: 1284, deletions: 2345, rows: [] }, comments: 2, onPress: vi.fn() })));
  expect(node.textContent).toContain("+1.284"); expect(node.textContent).toContain("−2.345");
  expect(node.textContent).toContain("northwind/mobile #1284"); expect(node.textContent).toContain("aaaaaaa"); expect(node.textContent).toContain("Open");
  const row = node.querySelector("[aria-label^=\"src/draft-1284.ts\"]");
  expect(row?.textContent).toContain("draft-1284.ts"); expect(row?.textContent).toContain("Renamed"); expect(row?.textContent).toContain("From src/old.ts");
  expect(row?.getAttribute("aria-label")).toContain("2 pending comments");
});
