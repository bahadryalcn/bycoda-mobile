import type {
  HostConnection,
  HostDescriptor,
  HostProject,
  HostProjectDirectory,
  HostDirectory,
  HostModelCatalog,
  HostSession,
  HostSessionSummary,
  HostCommand,
  CommandReceipt,
  SessionSync,
  SessionSyncResponse,
  MachineChanges,
  MachineChangesRequest,
  ProjectScope,
  FsEntry,
  GitDiffIndex,
  GitFileDiff,
  GitBranches,
  HostTask,
  HostTaskInput,
  TaskStatus,
  HostAutomation,
  HostAutomationInput,
  HostAutomationRun,
  HostSettings,
  HostSettingsState,
  SocialAccount,
  SocialThread,
  SocialPolicy,
  SocialPlatform,
  SocialSnapshot,
  PrWatch,
  PrWatchInput,
} from "../domain/types";
import { REMOTE_PROVIDERS } from "../domain/providers";
import { applySessionSync } from "../domain/sessionSync";
import { HostTransport, HostError, type FetchLike, type RequestOptions } from "./transport";
import type { Note, NoteUpsert } from "../domain/types";

export type SessionPage = {
  before?: number;
  revision: number;
  totalBlocks: number;
  sync: SessionSyncResponse;
};
export class HostClient {
  readonly transport: HostTransport;
  constructor(
    connection: HostConnection,
    fetcher?: FetchLike,
    credentialReader?: () => Promise<string | null>,
    assertAccess?: () => void,
  ) {
    this.transport = new HostTransport(connection, fetcher, credentialReader, assertAccess);
  }
  request = <T>(method: string, params: object = {}, options?: RequestOptions): Promise<T> =>
    this.transport.request<T>(method, params, options);
  async describe(): Promise<HostDescriptor> {
    const value = await this.request<HostDescriptor>("environment.describe", {
      supportedProviders: REMOTE_PROVIDERS,
    });
    if (
      value?.protocolVersion !== 1 ||
      !value.environmentId ||
      !Array.isArray(value.capabilities) ||
      !Array.isArray(value.providers)
    )
      throw new HostError("protocol", "Incompatible bycoda Host.", this.transport.connection.id);
    this.transport.acceptIdentity(value.environmentId);
    return value;
  }
  disconnect = () => this.transport.disconnect();
  reconnect = () => this.transport.reconnect();
  projects = {
    list: () => this.request<HostProject[]>("projects.list"),
    directory: () => this.request<HostProjectDirectory>("projects.directory"),
    open: (cwd: string) => this.request<HostProject>("projects.open", { cwd }),
    browse: (path?: string) => this.request<HostDirectory>("projects.browse", { path }),
    createDirectory: (path: string, name: string) =>
      this.request<HostDirectory>("projects.createDirectory", { path, name }),
  };
  models = {
    list: (projectId: string) => this.request<HostModelCatalog>("models.list", { projectId }),
  };
  sessions = {
    list: (projectId: string) => this.request<HostSessionSummary[]>("sessions.list", { projectId }),
    read: async (sessionId: string): Promise<HostSession> => {
      const page = await this.sessions.page(sessionId);
      const sync = await this.resolveSync(sessionId, page.sync);
      if (sync.kind !== "snapshot")
        throw new HostError(
          "protocol",
          "Expected a transcript snapshot.",
          this.transport.connection.id,
        );
      return sync.value;
    },
    page: (sessionId: string, before?: number, revision?: number) =>
      this.request<SessionPage>("sessions.page", {
        sessionId,
        before,
        revision,
        preview: true,
      }),
    sync: async (
      sessionId: string,
      known?: HostSession,
      signal?: AbortSignal,
    ): Promise<HostSession> => {
      const reply = await this.request<SessionSyncResponse>(
        "sessions.sync",
        {
          sessionId,
          revision: known?.revision,
          partial: Boolean(known?.history),
          loadedBlockIds: known?.session.blocks.map((block) => block.id),
          waitMs: known ? 20_000 : 0,
        },
        { signal, timeoutMs: 30_000 },
      );
      return applySessionSync(known, await this.resolveSync(sessionId, reply, signal));
    },
    block: async (sessionId: string, blockId: string, revision: number) =>
      this.resolveSync(
        sessionId,
        await this.request<SessionSyncResponse>("sessions.block", {
          sessionId,
          blockId,
          revision,
        }),
      ),
    dispatch: (command: HostCommand) => this.request<CommandReceipt>("commands.dispatch", command),
    create: (input: Omit<Extract<HostCommand, { type: "create" }>, "type">) =>
      this.sessions.dispatch({ ...input, type: "create" }),
    send: (sessionId: string, text: string, commandId: string) =>
      this.sessions.dispatch({ type: "send", sessionId, text, commandId }),
    cancel: (sessionId: string, runId: string, commandId: string) =>
      this.sessions.dispatch({ type: "cancel", sessionId, runId, commandId }),
    update: (
      projectId: string,
      sessionId: string,
      patch: { title?: string; archived?: boolean; pinned?: boolean },
    ) =>
      this.request<HostSessionSummary>("sessions.update", {
        projectId,
        sessionId,
        ...patch,
      }),
    delete: (projectId: string, sessionId: string) =>
      this.request("sessions.delete", { projectId, sessionId }),
    commandStatus: (commandId: string) =>
      this.request<CommandReceipt | null>("commands.status", { commandId }),
  };
  private async resolveSync(
    sessionId: string,
    response: SessionSyncResponse,
    signal?: AbortSignal,
  ): Promise<SessionSync> {
    if (response.kind !== "chunked") return response;
    if (
      !Number.isSafeInteger(response.length) ||
      response.length < 1 ||
      response.length > 32 * 1024 * 1024
    )
      throw new HostError(
        "protocol",
        "Invalid transcript transfer length.",
        this.transport.connection.id,
      );
    const pieces: string[] = [];
    let offset = 0;
    while (offset < response.length) {
      const chunk = await this.request<{ data: string }>(
        "sessions.syncChunk",
        { sessionId, transfer: response.transfer, offset },
        { signal },
      );
      if (
        typeof chunk.data !== "string" ||
        !chunk.data.length ||
        offset + chunk.data.length > response.length
      )
        throw new HostError(
          "protocol",
          "Invalid transcript transfer chunk.",
          this.transport.connection.id,
        );
      pieces.push(chunk.data);
      offset += chunk.data.length;
    }
    const sync = JSON.parse(pieces.join("")) as SessionSync;
    if (!["snapshot", "delta", "unchanged"].includes(sync.kind))
      throw new HostError("protocol", "Invalid transcript transfer.", this.transport.connection.id);
    return sync;
  }
  files = {
    list: (scope: ProjectScope, path = "") =>
      this.request<FsEntry[]>("files.list", { ...scope, path }),
    read: (scope: ProjectScope, path: string) =>
      this.request<string>("files.read", { ...scope, path }),
    write: (scope: ProjectScope, path: string, expected: string, content: string) =>
      this.request<null>("files.write", { ...scope, path, expected, content }),
    create: (scope: ProjectScope, parent: string, name: string, isDir: boolean) =>
      this.request("files.create", { ...scope, parent, name, isDir }),
    search: (scope: ProjectScope, query: string) =>
      this.request<string[]>("files.search", { ...scope, query }),
  };
  git = {
    index: (scope: ProjectScope) => this.request<GitDiffIndex>("git.index", scope),
    fileDiff: (scope: ProjectScope, path: string, staged = false) =>
      this.request<GitFileDiff>("git.fileDiff", { ...scope, path, staged }),
    action: (
      scope: ProjectScope,
      action: "stage" | "unstage" | "stageAll" | "unstageAll" | "commit" | "stageContents",
      path?: string,
      message?: string,
      content?: string,
    ) =>
      this.request<null>(
        "git.action",
        { ...scope, action, path, message, content },
        { timeoutMs: 120_000 },
      ),
    branches: (scope: ProjectScope) => this.request<GitBranches>("git.branches", scope),
    switch: (scope: ProjectScope, branch: string, remote?: string) =>
      this.request<null>("git.switch", { ...scope, branch, remote }, { timeoutMs: 120_000 }),
    createBranch: (scope: ProjectScope, branch: string) =>
      this.request<null>("git.createBranch", { ...scope, branch }),
  };
  tasks = {
    list: (projectId?: string) => this.request<HostTask[]>("tasks.list", { projectId }),
    save: (task: HostTaskInput) => this.request<HostTask>("tasks.save", { task }),
    move: (taskId: string, to: TaskStatus) =>
      this.request<HostTask>("tasks.move", { taskId, to }, { timeoutMs: 120_000 }),
    delete: (taskId: string, discard = false) => this.request("tasks.delete", { taskId, discard }),
    notesRead: (taskId: string, noteIds?: string[]) =>
      this.request("tasks.notes.read", { taskId, noteIds }),
    notesResolve: (taskId: string, noteId: string, resolved: boolean) =>
      this.request("tasks.notes.resolve", { taskId, noteId, resolved }),
    recheck: (taskId: string) => this.request<HostTask>("tasks.review.recheck", { taskId }),
  };
  automations = {
    list: () => this.request<HostAutomation[]>("automations.list"),
    save: (automation: HostAutomationInput) =>
      this.request<HostAutomation>("automations.save", { automation }),
    delete: (automationId: string) => this.request("automations.delete", { automationId }),
    runs: (automationId: string) =>
      this.request<HostAutomationRun[]>("automations.runs", { automationId }),
    runNow: (automationId: string) =>
      this.request<HostAutomationRun>("automations.runNow", { automationId }),
  };
  settings = {
    get: () => this.request<HostSettingsState>("host.settings.get"),
    save: (settings: HostSettings) =>
      this.request<HostSettingsState>("host.settings.save", { settings }),
  };
  notes = {
    list: (projectId?: string) => this.request<Note[]>("notes.list", { projectId }),
    get: (id: string) => this.request<Note | null>("notes.get", { id }),
    upsert: (note: NoteUpsert & { expectedUpdatedAt?: number }, projectId?: string) =>
      this.request<Note>("notes.upsert", { projectId, note }),
    delete: (id: string, expectedUpdatedAt?: number) =>
      this.request("notes.delete", { id, expectedUpdatedAt }),
  };
  social = {
    request: <T>(action: string, input: object = {}, requestId?: string) =>
      this.request<T>("social.request", { action, input, requestId }),
    accounts: () => this.social.request<SocialAccount[]>("accounts.list"),
    inbox: () => this.social.request<SocialThread[]>("inbox.list"),
    snapshot: () => this.social.request<SocialSnapshot>("snapshot"),
    policy: (accountId: string) =>
      this.social.request<{
        platform: SocialPlatform;
        effective: SocialPolicy;
      }>("policy.get", {
        accountId,
      }),
  };
  inbox = {
    list: (projectId: string) => this.request<PrWatch[]>("delivery.pr.list", { projectId }),
    link: (input: PrWatchInput) => this.request<PrWatch>("delivery.pr.link", { input }),
  };
  workspace = {
    run: <T>(command: string, args: object) =>
      this.request<T>("workspace.run", { command, args }, { timeoutMs: 120_000 }),
  };
  changes = (params: MachineChangesRequest, signal?: AbortSignal) =>
    this.request<MachineChanges>(
      "machine.changes",
      { ...params, waitMs: 20_000 },
      { signal, timeoutMs: 30_000 },
    );
}
export const createHostClient = (
  connection: HostConnection,
  fetcher?: FetchLike,
  credentialReader?: () => Promise<string | null>,
  assertAccess?: () => void,
) => new HostClient(connection, fetcher, credentialReader, assertAccess);
