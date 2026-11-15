import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { CampaignsPanel } from "./campaigns-panel";
import type { CampaignsPanelProps } from "./types";

vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("@/ui/record-card", () => ({ RecordCard: "record-card" }));
vi.mock("@/ui/primitives", () => ({ ActionMenu: "menu", Body: "body", Button: "button", NavigationGroup: "group", Row: "row", SelectField: "select", Stack: "stack" }));
vi.mock("./content-excerpt", () => ({ ContentExcerpt: "excerpt" }));
vi.mock("./action-feedback", () => ({ SocialCollectionFeedback: "feedback", SocialRecordFeedback: "feedback" }));
vi.mock("../shared/format", () => ({ stamp: () => "date" }));
vi.mock("./collection-rows", () => ({ CollectionRows: "collection-rows" }));
vi.mock("./collection-search", () => ({ CollectionSearch: "search", useCollectionSearch: (items: unknown[]) => ({ visible: items }) }));

function actions(approvedCampaignIds: string[] | undefined, stopped = false) {
  const campaign = { id: "campaign", name: "Reviewed content", projectIds: [], variants: [], paused: false };
  const props = { state: { campaigns: [campaign], accounts: [], approvedCampaignIds, sendingEnabled: true, stopped }, projectId: null, action: { isPending: false }, dispatch: vi.fn(), run: vi.fn() } as unknown as CampaignsPanelProps;
  const panel = CampaignsPanel(props) as ReactElement<{ children: ReactNode }>;
  const rows = Children.toArray(panel.props.children).find(node => isValidElement(node) && node.type === "collection-rows") as ReactElement<{ renderItem: (item: typeof campaign) => ReactElement<{ footer: ReactElement<{ children: ReactNode }> }> }>;
  return Children.toArray(rows.props.renderItem(campaign).props.footer.props.children) as ReactElement<{ disabled?: boolean; tone: string }>[];
}

it("makes approval primary until approved and keeps publishing locked", () => {
  const unapproved = actions([]);
  expect(unapproved.map(button => button.props.tone)).toEqual(["primary", "secondary"]);
  expect(unapproved[1].props.disabled).toBe(true);
  const approved = actions(["campaign"]);
  expect(approved.map(button => button.props.tone)).toEqual(["quiet", "primary"]);
  expect(approved[1].props.disabled).toBe(false);
  expect(actions(["campaign"], true)[1].props.disabled).toBe(true);
});

it("keeps legacy Host approval checks reachable when approval IDs are absent", () => {
  expect(actions(undefined)[1].props.disabled).toBe(false);
});
