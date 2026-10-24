import type {
  RemoteInboxAvailability,
  RemoteInboxDetails,
  RemoteInboxList,
  RemoteInboxPrAction,
  RemoteInboxProviderState,
  RemoteInboxQuery,
  RemoteInboxTarget,
  RemoteInboxThread,
  RemoteInboxReview,
} from "../../../../src/features/inbox/model/remoteInbox";
import type { PrReviewContext } from "./provider-review-model";
import type { JiraMobileBoard,JiraBoardSnapshot,JiraMobileTransition,JiraWriteOutcome } from "./jira-board-model";

export type InboxOrigin = {
  machineId: string;
  projectId: string | null;
};

export type InboxAvailabilityState = {
  data?: RemoteInboxAvailability;
  isSuccess: boolean;
  isEnabled?: boolean;
  fetchStatus?: "fetching" | "paused" | "idle";
};

export type InboxItemInput = {
  item: RemoteInboxTarget;
  projectId?: string;
};

export type InboxCommentParams = {
  body: string;
  inReplyTo?: string;
  confirm: "SEND_COMMENT";
};

export type InboxPrParams = {
  prAction: RemoteInboxPrAction;
  confirm: "CHANGE_PR_STATE";
};

export type InboxJobInputs = {
  providers: Record<string, never>;
  list: { projectId?: string; query: RemoteInboxQuery };
  details: InboxItemInput;
  thread: InboxItemInput;
  comment: InboxItemInput & InboxCommentParams;
  "pr-action": InboxItemInput & InboxPrParams;
  "review-context": InboxItemInput;
  review: InboxItemInput & RemoteInboxReview & { confirm: "SUBMIT_PR_REVIEW" };
  "jira-boards":{projectId:string};
  "jira-board-read":{projectId:string;boardId:number;scope:"board"|"backlog"|"sprint";sprintId?:number;pageToken?:string};
  "jira-issue-transitions":{projectId:string;snapshotId:string;key:string};
  "jira-board-transition":{projectId:string;snapshotId:string;key:string;transitionId:string;confirm:"CHANGE_JIRA_BOARD"};
  "jira-board-move":{projectId:string;snapshotId:string;key:string;target:"board"|"backlog"|"sprint"|"rank";sprintId?:number;beforeKey?:string;afterKey?:string;confirm:"CHANGE_JIRA_BOARD"};
};

export type InboxJobResults = {
  providers: RemoteInboxProviderState[];
  list: RemoteInboxList;
  details: RemoteInboxDetails;
  thread: RemoteInboxThread;
  comment: unknown;
  "pr-action": unknown;
  "review-context": PrReviewContext;
  review: unknown;
  "jira-boards":JiraMobileBoard[];
  "jira-board-read":JiraBoardSnapshot;
  "jira-issue-transitions":JiraMobileTransition[];
  "jira-board-transition":JiraWriteOutcome;
  "jira-board-move":JiraWriteOutcome;
};

export type InboxJobAction = keyof InboxJobInputs;
export type InboxReadAction = "providers" | "list" | "details" | "thread" | "review-context" | "jira-boards" | "jira-board-read" | "jira-issue-transitions";

export type InboxJobRequest<Action extends InboxJobAction = InboxJobAction> = {
  [Kind in Action]: { action: Kind; input: InboxJobInputs[Kind] };
}[Action];

export type InboxWriteCommand = InboxJobRequest<"comment" | "pr-action" | "review" | "jira-board-transition" | "jira-board-move">;
export type InboxWriteResult = {
  action: InboxWriteCommand["action"];
  result: unknown;
};

export type InboxWriteStatus = {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
  data?: InboxWriteResult;
};
