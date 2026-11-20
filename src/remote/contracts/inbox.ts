export type MobileInboxItem = {
  id: string;
  kind: "session" | "task" | "goal" | "automation" | "social" | "pull-request";
  resourceId: string;
  projectId?: string;
  title: string;
  detail: string;
  updatedAt: number;
  sessionId?: string;
  status?: string;
};

export type MobileInbox = {
  items: MobileInboxItem[];
  scope: "host-attention";
  externalProviderInboxAvailable: false;
  /**
   * Projects whose sessions did not answer before the Host's deadline. Their items are absent,
   * not empty. Omitted when the read was complete and by Hosts that predate this field.
   */
  unavailableProjectIds?: string[];
};

/** Wire compatibility with paired hosts that still support pull-request watches. */
export type PrWatchInput = {
  projectId: string;
  repo: string;
  number: number;
  sessionId?: string;
  taskId?: string;
  autoWake?: boolean;
};
export type PrWatchSnapshot = {
  headOid: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  failedChecks: string[];
  reviewIds: string[];
  conflicting: boolean;
};
export type PrWatch = PrWatchInput & {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: "watching" | "paused" | "closed";
  wakes: number;
  readFailures: number;
  snapshot?: PrWatchSnapshot;
  pendingEvent?: { id: string; prompt: string };
  lastEventId?: string;
  notice?: string;
};
