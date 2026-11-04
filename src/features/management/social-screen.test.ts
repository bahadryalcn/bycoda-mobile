// @vitest-environment happy-dom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SocialScreen } from "./social-screen";
import type { SocialTab } from "./social-flow";

const fixture = vi.hoisted(() => ({ tab: undefined as undefined | ((value: SocialTab) => void), mutate: vi.fn(), hasAccount: false, workspace: vi.fn(),
  available:true,thread:undefined as any,openThread:undefined as undefined|(()=>void),editReply:undefined as undefined|((text:string)=>void) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({ useMachines: (select: (value: unknown) => unknown) => select({ selectedProjectId: "p" }) }));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => ({ data: [] }) }));
vi.mock("./shared/scope", () => ({ Scope: () => null }));
vi.mock("./shared/format", () => ({ identifier: () => "request" }));
vi.mock("@/state/queries", () => ({
  useHostMutation: () => ({ mutate: fixture.mutate }),
}));
// The bounded query hook has its own transport/cache integration suite. These
// tests exercise SocialScreen's real reducer, empty-state copy and local CTAs.
vi.mock("./social/use-workspace-query", () => ({ useSocialWorkspace: (tab: SocialTab, projectId: string | null) => {
  fixture.workspace(tab, projectId);
  const collections = { inbox: "threads", drafts: "drafts", accounts: undefined, campaigns: "campaigns", automations: "rules", jobs: "jobs" } as const;
  const collection = collections[tab];
  const pages = Object.fromEntries(["threads", "drafts", "campaigns", "rules", "jobs"].map((name) => [name, { offset: 0, limit: 20, total: 0 }]));
  const state = { accounts: fixture.hasAccount ? [{ id: "account", grants: { p: ["draft"] } }] : [], threads: fixture.thread?[fixture.thread]:[], drafts: [], campaigns: [], rules: [], jobs: [], pages };
  return { state:fixture.available?state:undefined, collection, query: { data: fixture.available?state:undefined, isSuccess: fixture.available }, missingEnvironment: false,
    page: collection ? { search: "", setSearch: vi.fn(), page: pages[collection], loading: false, busy: false, invalidSearch: false, onOffset: vi.fn() } : undefined };
} }));
vi.mock("./social/accounts-panel", () => ({ AccountsPanel: () => createElement("output", null, "Accounts panel") }));
vi.mock("./social/threads-panel", () => ({ ThreadsPanel: ({dispatch}:any) => {fixture.openThread=()=>dispatch({type:"open",editor:{kind:"thread",id:fixture.thread.id}});return createElement("output", null, "Inbox panel");} }));
vi.mock("./social/thread-editor",()=>({ThreadEditor:({available=true}:any)=>{
  const[text,setText]=useState("");fixture.editReply=setText;
  return createElement("input",{value:text,readOnly:!available,onChange:(event:any)=>setText(event.target.value)});
}}));
vi.mock("./social/draft-editor",()=>({DraftEditor:()=>null}));
vi.mock("./social/campaign-editor",()=>({CampaignEditor:()=>null}));
vi.mock("./social/rule-editor",()=>({RuleEditor:()=>null}));
vi.mock("./social/drafts-panel", () => ({ DraftsPanel: () => createElement("output", null, "Drafts panel") }));
vi.mock("./social/campaigns-panel", () => ({ CampaignsPanel: () => null }));
vi.mock("./social/rules-panel", () => ({ RulesPanel: () => null }));
vi.mock("./social/jobs-panel", () => ({ JobsPanel: () => null }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Screen: ({context,children}:any) => createElement("div",null,context,children), Row: wrapper, Body: wrapper, NavigationGroup: wrapper, Sheet:wrapper,
    ContextControls: ({scope,view}:any) => createElement("div",null,scope,view),
    Badge: () => null, MutationState: () => null, Notice: () => null,
    QueryState: ({ empty, emptyTitle }: { empty: boolean; emptyTitle: string }) => empty ? createElement("p", null, emptyTitle) : null,
    SelectField: ({ onChange }: { onChange: typeof fixture.tab }) => { fixture.tab = onChange; return null; },
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
  };
});

let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); vi.unstubAllGlobals(); vi.clearAllMocks(); fixture.hasAccount = false;fixture.available=true;fixture.thread=undefined;fixture.openThread=undefined;fixture.editReply=undefined; });

it("keeps the same reply owner, draft and selection while workspace verification disappears and returns",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 fixture.thread={id:"thread",accountId:"account",contactId:"contact",events:[]};
 const container=document.createElement("div");document.body.append(container);root=createRoot(container);
 const render=()=>root.render(createElement(SocialScreen));
 try {
  await act(async()=>render());await act(async()=>fixture.openThread!());
  await act(async()=>fixture.editReply!("Retained reply"));
  const input=container.querySelector("input")!;input.focus();input.setSelectionRange(2,7);
  fixture.available=false;await act(async()=>render());
  expect(container.querySelector("input")).toBe(input);expect(input.value).toBe("Retained reply");expect(input.readOnly).toBe(true);
  expect(document.activeElement).toBe(input);expect([input.selectionStart,input.selectionEnd]).toEqual([2,7]);
  fixture.available=true;await act(async()=>render());
  expect(container.querySelector("input")).toBe(input);expect(input.value).toBe("Retained reply");expect(input.readOnly).toBe(false);
  expect(fixture.mutate).not.toHaveBeenCalled();
 }finally {container.remove();}
});

it("guides an empty collection to account setup using only local navigation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(createElement(SocialScreen)));
  expect(container.textContent).toContain("No conversations yet");
  expect(fixture.workspace).toHaveBeenLastCalledWith("inbox", "p");
  const accounts = [...container.querySelectorAll("button")].find((button) => button.textContent === "Accounts");
  expect(accounts).toBeDefined();
  act(() => accounts!.click());
  expect(container.textContent).toContain("Accounts panel");
  expect(container.textContent).toContain("No social accounts on this computer");
  expect(fixture.workspace).toHaveBeenLastCalledWith("accounts", "p");
  expect(container.querySelectorAll("button")).toHaveLength(0);
  act(() => fixture.tab?.("drafts"));
  expect(container.textContent).toContain("No drafts yet");
  expect(container.querySelector("button")?.textContent).toBe("Accounts");
  expect(fixture.mutate).not.toHaveBeenCalled();
});

it.each([
  ["drafts", "Inbox", "Inbox panel"],
  ["jobs", "Drafts", "Drafts panel"],
] as const)("guides empty %s to the existing review flow without creating or sending", async (tab, label, destination) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.hasAccount = true;
  const container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(createElement(SocialScreen)));
  act(() => fixture.tab?.(tab));
  expect(fixture.workspace).toHaveBeenLastCalledWith(tab, "p");
  const next = [...container.querySelectorAll("button")].find((button) => button.textContent === label);
  expect(next).toBeDefined();
  act(() => next!.click());
  expect(container.textContent).toContain(destination);
  expect(fixture.mutate).not.toHaveBeenCalled();
});
