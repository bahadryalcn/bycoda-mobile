export type SocialTab = "inbox" | "drafts" | "accounts" | "campaigns" | "automations" | "jobs";
export type SocialEditor =
  | { kind: "closed" }
  | { kind: "thread"; id: string }
  | { kind: "draft"; id: string }
  | { kind: "campaign"; accountId: string; projectId: string }
  | { kind: "rule"; accountId: string; projectId: string };
export type SocialFlow = { tab: SocialTab; editor: SocialEditor };
export type SocialFlowEvent =
  | { type: "tab"; tab: SocialTab }
  | { type: "open"; editor: Exclude<SocialEditor, { kind: "closed" }> }
  | { type: "close"; editor?: SocialEditor };
export const initialSocialFlow: SocialFlow = { tab: "inbox", editor: { kind: "closed" } };
export function socialFlowReducer(state: SocialFlow, event: SocialFlowEvent): SocialFlow {
  if (event.type === "tab") return { tab: event.tab, editor: { kind: "closed" } };
  if (event.type === "close")
    return event.editor && event.editor !== state.editor
      ? state
      : { ...state, editor: { kind: "closed" } };
  const tab: SocialTab = (
    { thread: "inbox", draft: "drafts", campaign: "campaigns", rule: "automations" } as const
  )[event.editor.kind];
  return { tab, editor: event.editor };
}
