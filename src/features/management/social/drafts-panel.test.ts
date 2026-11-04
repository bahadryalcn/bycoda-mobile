import { beforeEach, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { DraftsPanel } from "./drafts-panel";
import type { DraftsPanelProps, SocialDraft } from "./types";

const confirmation = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock("@/ui/confirm", () => ({ confirmAction: confirmation.show }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/record-card", () => ({ RecordCard: "record-card" }));
vi.mock("@/ui/message-text", () => ({ MessageText: "message-text" }));
vi.mock("@/ui/primitives", () => ({
  ActionMenu: "action-menu",
  Sheet: "sheet",
  Body: "body",
  Button: "button",
  Row: "row",
}));
vi.mock("../shared/paged-rows", () => ({ PagedRows: "paged-rows" }));
vi.mock("../shared/status", () => ({ Status: "status" }));
vi.mock("./draft-editor", () => ({ DraftEditor: "draft-editor" }));
vi.mock("./collection-search", () => ({
  CollectionSearch: "collection-search",
  useCollectionSearch: (items: unknown[]) => ({ visible: items }),
}));
vi.mock("./collection-rows", () => ({ CollectionRows: "collection-rows" }));

beforeEach(() => vi.clearAllMocks());

function approval(pending?: { action: string; input: { id: string } }) {
  const draft: SocialDraft = {
    id: "draft",
    accountId: "account",
    projectId: "project",
    kind: "message",
    contactId: "recipient",
    text: "Full reviewed text\nwith a second line",
    createdAt: 1,
    factIds: ["fact"],
    media: [{ kind: "image", url: "https://example.test/image", alt: "Reviewed image" }],
  };
  const run = vi.fn();
  const props = {
    state: { drafts: [draft], accounts: [{ id: "account", name: "Reviewed account" }], jobs: [] },
    projectId: null,
    action: { isPending: !!pending, variables: pending },
    run,
  } as unknown as DraftsPanelProps;
  const panel = DraftsPanel(props) as ReactElement<{ children: ReactNode[] }>;
  const rows = Children.toArray(panel.props.children).find(node => isValidElement(node) && node.type === "collection-rows") as ReactElement<{
    renderItem: (
      draft: SocialDraft,
    ) => ReactElement<{
      footer: ReactElement<{ children: ReactElement<{ onPress: () => void; busy?: boolean; disabled?: boolean }>[] }>;
    }>;
  }>;
  const card = rows.props.renderItem(draft);
  const button = card.props.footer.props.children[0];
  return { draft, run, press: button.props.onPress, buttons: card.props.footer.props.children };
}

it("previews the full text, recipient and media before any approval request", () => {
  const { draft, run, press } = approval();
  press();
  const detail = confirmation.show.mock.calls[0][1];
  for (const text of [
    draft.text,
    draft.contactId,
    "Reviewed account",
    "https://example.test/image",
    "Reviewed image",
  ])
    expect(detail).toContain(text);
  expect(run).not.toHaveBeenCalled();
});

it("submits the exact reviewed snapshot even if the current draft changes during confirmation", () => {
  const { draft, run, press } = approval();
  const reviewed = JSON.parse(JSON.stringify(draft));
  press();
  draft.text = "Unreviewed replacement";
  draft.factIds.push("new-fact");
  draft.media![0].alt = "Unreviewed image";
  confirmation.show.mock.calls[0][3]();
  expect(run).toHaveBeenCalledExactlyOnceWith("drafts.approve", {
    id: reviewed.id,
    reviewedDraft: reviewed,
  });
});

it("shows pending on only the initiating draft and operation while preserving approval locks", () => {
  const approving = approval({ action: "drafts.approve", input: { id: "draft" } }).buttons;
  expect(approving.map((button) => !!button.props.busy)).toEqual([true, false]);
  expect(approving.every((button) => button.props.disabled)).toBe(true);
  const sending = approval({ action: "messages.send", input: { id: "draft" } }).buttons;
  expect(sending.map((button) => !!button.props.busy)).toEqual([false, true]);
  const other = approval({ action: "messages.send", input: { id: "other-draft" } }).buttons;
  expect(other.every((button) => !button.props.busy)).toBe(true);
});
