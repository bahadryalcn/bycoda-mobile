import type {
  HostRequest,
  Block,
  CommandReceipt,
  HostCommand,
  HostSession,
  HostSessionSummary,
  RemoteRequestOptions,
  RemoteTranscriptPage,
  SessionListResult,
  SessionSyncResponse,
  TranscriptPage,
} from "../types";
import { HostTransport, RemoteHostError } from "../transport";
import { applySessionSync } from "../../../../src/features/connections/model/protocol";
import { resolveSessionSync } from "../session-sync";

export function createSessionsApi(transport: HostTransport, request: HostRequest) {
  return {
    sessions: {
      list: (projectId: string, options?: RemoteRequestOptions) =>
        request<HostSessionSummary[]>("sessions.list", { projectId }, options),
      listChanges: (projectId: string, known: string, options?: RemoteRequestOptions) =>
        request<SessionListResult>("sessions.list", { projectId, known }, options),
      get: (sessionId: string, revision?: number, options?: RemoteRequestOptions) =>
        request<HostSession | null>("sessions.get", { sessionId, revision }, options),
      page: async (
        sessionId: string,
        before?: number,
        revision?: number,
        options?: RemoteRequestOptions,
      ): Promise<TranscriptPage> => {
        const page = await request<RemoteTranscriptPage>(
          "sessions.page",
          { sessionId, before, revision, preview: true },
          options,
        );
        const sync = await resolveSessionSync(transport, sessionId, page.sync, options);
        if (sync.kind !== "snapshot")
          throw new RemoteHostError(
            transport.machine.id,
            "protocol",
            "The host returned an invalid transcript page.",
          );
        return {
          value: sync.value,
          before: page.before,
          totalBlocks: page.totalBlocks,
          revision: page.revision,
        };
      },
      synchronize: async (
        sessionId: string,
        known?: HostSession,
        options?: RemoteRequestOptions,
        waitMs = 0,
      ): Promise<HostSession> => {
        const response = await request<SessionSyncResponse>(
          "sessions.sync",
          {
            sessionId,
            revision: known?.revision,
            waitMs,
            ...(known?.history
              ? { partial: true, loadedBlockIds: known.session.blocks.map((block) => block.id) }
              : {}),
          },
          options,
        );
        const sync = await resolveSessionSync(transport, sessionId, response, options);
        try {
          return applySessionSync(known, sync);
        } catch {
          throw new RemoteHostError(
            transport.machine.id,
            "protocol",
            "The transcript changed. Reload its latest history page.",
          );
        }
      },
      block: async (
        sessionId: string,
        blockId: string,
        revision: number,
        options?: RemoteRequestOptions,
      ): Promise<Block> => {
        const response = await request<SessionSyncResponse>(
          "sessions.block",
          { sessionId, blockId, revision },
          options,
        );
        const sync = await resolveSessionSync(transport, sessionId, response, options);
        const block =
          sync.kind === "snapshot"
            ? sync.value.session.blocks.find((entry) => entry.id === blockId)
            : undefined;
        if (!block)
          throw new RemoteHostError(
            transport.machine.id,
            "protocol",
            "The transcript block could not be loaded.",
          );
        return block;
      },
      dispatch: (command: HostCommand, options?: RemoteRequestOptions) =>
        request<CommandReceipt>("commands.dispatch", { ...command }, options),
      commandStatus: (commandId: string, options?: RemoteRequestOptions) =>
        request<CommandReceipt | null>("commands.status", { commandId }, options),
      update: (
        projectId: string,
        sessionId: string,
        patch: { title?: string; archived?: boolean; pinned?: boolean },
        options?: RemoteRequestOptions,
      ) => request<HostSession>("sessions.update", { projectId, sessionId, ...patch }, options),
      delete: (projectId: string, sessionId: string, options?: RemoteRequestOptions) =>
        request<{ deleted: true }>("sessions.delete", { projectId, sessionId }, options),
    },
  };
}
