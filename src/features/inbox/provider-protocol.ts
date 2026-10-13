import type {
  RemoteInboxAvailability,
  RemoteInboxDetails,
  RemoteInboxList,
  RemoteInboxPrAction,
  RemoteInboxProviderState,
  RemoteInboxQuery,
  RemoteInboxTarget,
  RemoteInboxThread,
} from "../../../../src/features/inbox/model/remoteInbox";

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
};

export type InboxJobResults = {
  providers: RemoteInboxProviderState[];
  list: RemoteInboxList;
  details: RemoteInboxDetails;
  thread: RemoteInboxThread;
  comment: unknown;
  "pr-action": unknown;
};

export type InboxJobAction = keyof InboxJobInputs;
export type InboxReadAction = "providers" | "list" | "details" | "thread";

export type InboxJobRequest<Action extends InboxJobAction = InboxJobAction> = {
  [Kind in Action]: { action: Kind; input: InboxJobInputs[Kind] };
}[Action];

export type InboxWriteCommand = InboxJobRequest<"comment" | "pr-action">;
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
