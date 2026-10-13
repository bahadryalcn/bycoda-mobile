import { describe, expect, it } from "vitest";
import {
  acknowledgeInboxComment,
  commentSubmission,
  inboxBrowseReducer,
  initialInboxBrowseState,
} from "./provider-state";
import type {
  RemoteInboxItem,
  RemoteInboxComment,
} from "../../../../src/features/inbox/model/remoteInbox";

const item = {
  provider: "github",
  kind: "pr",
  number: 7,
  repo: "demo/repo",
  title: "Review",
  state: "OPEN",
  url: "https://example.invalid/7",
  updatedAt: "",
  projectPath: "/demo",
  draft: false,
  labels: [],
  assignees: [],
} satisfies RemoteInboxItem;
const comment = {
  id: "comment-1",
  threadId: "thread-1",
  body: "Review text",
  author: "demo",
  createdAt: "",
  kind: "review",
  url: "https://example.invalid/comment",
  resolved: false,
  replies: [],
} satisfies RemoteInboxComment;

describe("provider inbox browsing and confirmed comment snapshots", () => {
  it("resets detail and pagination atomically when a filter changes", () => {
    const selected = { ...initialInboxBrowseState, selected: item, limit: 120, notice: "Saved" };
    expect(inboxBrowseReducer(selected, { type: "filter", key: "all", value: true })).toMatchObject(
      { all: true, selected: null, limit: 40, notice: null },
    );
    expect(
      inboxBrowseReducer(selected, { type: "filter", key: "assigned", value: false }),
    ).toMatchObject({ assigned: false, selected: null, limit: 40 });
  });
  it("changes search results only after a committed search and preserves pagination for identical commits", () => {
    const selected = { ...initialInboxBrowseState, selected: item, limit: 80 };
    const typing = inboxBrowseReducer(selected, { type: "search", value: "parser" });
    expect(typing.selected).toBe(item);
    expect(typing.committedSearch).toBe("");
    const committed = inboxBrowseReducer(typing, { type: "commit-search", value: "parser" });
    expect(committed).toMatchObject({ committedSearch: "parser", selected: null, limit: 40 });
    expect(inboxBrowseReducer(committed, { type: "commit-search", value: "parser" })).toBe(
      committed,
    );
  });
  it("builds a fixed owner-approved text and provider-specific reply target", () => {
    const draft = { body: "  Approved reply  ", reply: comment };
    const confirmed = commentSubmission("github", draft);
    draft.body = "A newer draft";
    expect(confirmed).toEqual({
      body: "Approved reply",
      inReplyTo: "thread-1",
      confirm: "SEND_COMMENT",
    });
  });
  it("acknowledges only the submitted comment and leaves newer composer edits intact", () => {
    const submitted = { body: "Sent", reply: comment };
    expect(acknowledgeInboxComment(submitted, submitted)).toEqual({ body: "", reply: null });
    const newer = { ...submitted, body: "Newer draft" };
    expect(acknowledgeInboxComment(newer, submitted)).toBe(newer);
  });
  it("keeps successful PR feedback with the list when a detail closes", () => {
    expect(
      inboxBrowseReducer(
        { ...initialInboxBrowseState, selected: item },
        { type: "close", notice: "PR updated" },
      ),
    ).toMatchObject({ selected: null, notice: "PR updated" });
  });
});
